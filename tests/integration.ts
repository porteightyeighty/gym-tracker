/**
 * Integration tests against a real Postgres and the built server (`.output/`).
 *
 *   TEST_DATABASE_URL=postgres://…/gym_test npm run test:integration
 *
 * The test database is wiped and migrated from scratch, so its name must contain "test".
 * The worker is driven in-process via worker/process.ts, except the crash test, which kills a
 * real child process mid-batch.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../server/utils/schema.ts";
import { drain, MAX_ATTEMPTS, processBatch, replayAll } from "../worker/process.ts";

const { exerciseAnalyses, outbox, personalRecords, sets } = schema;

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL is not set");
  process.exit(1);
}
if (url === process.env.DATABASE_URL || !/test/i.test(new URL(url).pathname)) {
  console.error("Refusing to wipe TEST_DATABASE_URL: its database name must contain 'test' and differ from DATABASE_URL");
  process.exit(1);
}

const EMAIL = "test@example.com";
const PASSWORD = "integration-password";
const db = drizzle(url, { schema });
const quiet = { log: () => {} };

let server: ChildProcess;
let base = "";
let cookie = "";
let bench = "";
let pullUp = "";

async function freePort(): Promise<number> {
  const probe = createServer().listen(0);
  await once(probe, "listening");
  const { port } = probe.address() as { port: number };
  probe.close();
  return port;
}

function run(cmd: string, args: string[], env: Record<string, string>) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "inherit" });
  return once(child, "exit").then(([code]) => assert.equal(code, 0, `${args.join(" ")} failed`));
}

async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path, {
    method: init.method ?? "GET",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function outboxCount(kind?: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outbox)
    .where(kind ? eq(outbox.kind, kind) : undefined);
  return row!.n;
}

/** Logs a finished session at `day` (days ago) and returns its set ids. */
async function session(daysAgo: number, exerciseId: string, rows: [weightKg: number, reps: number][]) {
  const start = new Date(Date.now() - daysAgo * 86_400_000);
  const workout = await api("/api/workouts", { method: "POST", body: { startedAt: start.toISOString() } });
  assert.equal(workout.status, 200);
  const ids: string[] = [];
  for (const [i, [weightKg, reps]] of rows.entries()) {
    const res = await api("/api/sets", {
      method: "POST",
      body: { exerciseId, weightKg, reps, performedAt: new Date(start.getTime() + (i + 1) * 120_000).toISOString() },
    });
    assert.equal(res.status, 200);
    ids.push(res.body.id);
  }
  const done = await api(`/api/workouts/${workout.body.id}`, {
    method: "PATCH",
    body: { endedAt: new Date(start.getTime() + 3_600_000).toISOString() },
  });
  assert.equal(done.status, 200);
  return { workoutId: workout.body.id as string, setIds: ids };
}

/** Derived state minus ids and timestamps that legitimately differ between runs. */
async function snapshot() {
  const analyses = await db.select().from(exerciseAnalyses).orderBy(asc(exerciseAnalyses.exerciseId));
  const records = await db.select().from(personalRecords).orderBy(asc(personalRecords.setId), asc(personalRecords.kind));
  return {
    analyses: analyses.map(({ computedAt, ...rest }) => rest),
    records: records.map(({ id, ...rest }) => rest),
  };
}

async function recordsFor(setId: string) {
  return db.select({ kind: personalRecords.kind }).from(personalRecords).where(eq(personalRecords.setId, setId));
}

before(async () => {
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await run("node", ["scripts/seed.ts"], { DATABASE_URL: url, SEED_EMAIL: EMAIL, SEED_PASSWORD: PASSWORD });

  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn("node", [".output/server/index.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: url,
      BETTER_AUTH_URL: base,
      BETTER_AUTH_SECRET: "integration-test-secret-integration-test-secret",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/login`)).ok) break;
    } catch {}
    if (i > 100) throw new Error("server did not start; run `npm run build` first");
    await new Promise((r) => setTimeout(r, 100));
  }

  const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  assert.equal(signIn.status, 200, "sign-in failed");
  cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  const list = await api<{ id: string; name: string }[]>("/api/exercises");
  bench = list.body.find((e) => e.name === "Bench press")!.id;
  pullUp = list.body.find((e) => e.name === "Pull-up")!.id;
});

after(async () => {
  server?.kill();
  await db.$client.end();
});

test("requests without a session are rejected", async () => {
  const res = await fetch(`${base}/api/exercises/${bench}/analysis`);
  assert.equal(res.status, 401);
});

test("finishing a workout writes exactly one event; discarding an empty one writes none", async () => {
  const before = await outboxCount();
  const { workoutId } = await session(30, bench, [[100, 5]]);
  assert.equal(await outboxCount(), before + 1);
  const [event] = await db.select().from(outbox).where(eq(outbox.kind, "workout_finished"));
  assert.deepEqual(event!.payload, { workoutId });

  // Finishing again keeps the first end time and writes nothing.
  await api(`/api/workouts/${workoutId}`, { method: "PATCH", body: { endedAt: new Date().toISOString() } });
  assert.equal(await outboxCount(), before + 1);

  // Sets in an open workout are not history yet: logging and editing them writes nothing.
  const open = await api("/api/workouts", { method: "POST", body: {} });
  const set = await api("/api/sets", {
    method: "POST",
    body: { exerciseId: bench, weightKg: 50, reps: 5, performedAt: new Date().toISOString() },
  });
  await api(`/api/sets/${set.body.id}`, { method: "DELETE" });
  assert.equal(await outboxCount(), before + 1);

  const discarded = await api(`/api/workouts/${open.body.id}`, { method: "PATCH", body: { endedAt: new Date().toISOString() } });
  assert.deepEqual(discarded.body, { deleted: true });
  assert.equal(await outboxCount(), before + 1);
});

test("a route that fails after writing its event leaves no event (same transaction)", async () => {
  const { workoutId } = await session(29, bench, [[100, 5]]);
  await drain(db, quiet);
  const events = await outboxCount();
  const setCount = await db.$count(sets);

  // Backfilling a finished session enqueues first, then the insert hits the exercise FK.
  const res = await api("/api/sets", {
    method: "POST",
    body: {
      workoutId,
      exerciseId: "00000000-0000-4000-8000-000000000000",
      weightKg: 100,
      reps: 5,
      performedAt: new Date().toISOString(),
    },
  });
  assert.equal(res.status, 400);
  assert.equal(await outboxCount(), events);
  assert.equal(await db.$count(sets), setCount);

  // The same backfill with a real exercise does write one history_changed.
  const ok = await api("/api/sets", {
    method: "POST",
    body: { workoutId, exerciseId: bench, weightKg: 100, reps: 4, performedAt: new Date().toISOString() },
  });
  assert.equal(ok.status, 200);
  assert.equal(await outboxCount(), events + 1);
  const [latest] = await db.select().from(outbox).orderBy(sql`${outbox.createdAt} desc`).limit(1);
  assert.deepEqual(latest!.payload, { exerciseIds: [bench] });
});

test("editing an old set changes PRs after processing", async () => {
  const a = await session(20, bench, [[110, 5]]);
  const b = await session(19, bench, [[115, 5]]);
  await drain(db, quiet);
  assert.deepEqual((await recordsFor(b.setIds[0]!)).map((r) => r.kind).sort(), ["e1rm", "weight"]);

  // Raise the older set above the newer one: the newer set is no longer a record.
  const res = await api(`/api/sets/${a.setIds[0]}`, {
    method: "PATCH",
    body: { exerciseId: bench, weightKg: 120, reps: 5, performedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() },
  });
  assert.equal(res.status, 200);
  assert.deepEqual((await recordsFor(b.setIds[0]!)).length, 2, "derived data only changes once the worker runs");
  await drain(db, quiet);
  assert.equal((await recordsFor(b.setIds[0]!)).length, 0);
  assert.equal((await recordsFor(a.setIds[0]!)).length, 2);

  // The set list and the analysis route expose the result.
  const listed = await api<{ items: { id: string; records: { kind: string }[] }[] }>("/api/sets?limit=100");
  assert.equal(listed.body.items.find((s) => s.id === a.setIds[0])!.records.length, 2);
  const analysis = await api(`/api/exercises/${bench}/analysis`);
  assert.equal(analysis.status, 200);
  assert.equal(analysis.body.analysis.sessions >= 3, true);
});

test("bodyweight exercise: rep records and a +1 rep target", async () => {
  await session(10, pullUp, [[0, 8]]);
  const best = await session(9, pullUp, [[0, 10], [0, 9]]);
  await drain(db, quiet);
  assert.deepEqual((await recordsFor(best.setIds[0]!)).map((r) => r.kind), ["reps"]);
  const { body } = await api(`/api/exercises/${pullUp}/analysis`);
  assert.equal(body.analysis.mode, "reps");
  assert.equal(body.analysis.targetReps, 11);
});

test("cardio is logged as a duration and never analysed", async () => {
  const list = await api<{ id: string; name: string }[]>("/api/exercises");
  const treadmill = list.body.find((e) => e.name === "Treadmill")!.id;
  const at = new Date(Date.now() - 8 * 86_400_000);
  const workout = await api("/api/workouts", { method: "POST", body: { startedAt: at.toISOString() } });

  // Each kind of exercise takes only its own shape of entry.
  const strengthOnCardio = await api("/api/sets", {
    method: "POST",
    body: { exerciseId: treadmill, weightKg: 0, reps: 10, performedAt: at.toISOString(), workoutId: workout.body.id },
  });
  assert.equal(strengthOnCardio.status, 400);
  const durationOnStrength = await api("/api/sets", {
    method: "POST",
    body: { exerciseId: bench, durationSeconds: 600, performedAt: at.toISOString(), workoutId: workout.body.id },
  });
  assert.equal(durationOnStrength.status, 400);

  const run = await api("/api/sets", {
    method: "POST",
    body: { exerciseId: treadmill, durationSeconds: 1676, distanceKm: 3.2, performedAt: at.toISOString(), workoutId: workout.body.id },
  });
  assert.equal(run.status, 200);
  assert.deepEqual([run.body.reps, run.body.weightKg, run.body.durationSeconds, run.body.distanceKm], [0, "0.00", 1676, "3.20"]);
  await api(`/api/workouts/${workout.body.id}`, { method: "PATCH", body: { endedAt: new Date(at.getTime() + 3_600_000).toISOString() } });

  await drain(db, quiet);
  const { body } = await api(`/api/exercises/${treadmill}/analysis`);
  assert.deepEqual(body, { analysis: null, records: [] });
  const page = await api(`/api/sets?workoutId=${workout.body.id}`);
  assert.equal(page.body.items[0].durationSeconds, 1676);
});

test("processing the same event twice gives the same analyses", async () => {
  await drain(db, quiet);
  const first = await snapshot();
  const events = await db.select().from(outbox);
  // Re-deliver every event ever written.
  await db.insert(outbox).values(events.map((e) => ({ kind: e.kind, payload: e.payload })));
  const result = await drain(db, quiet);
  assert.equal(result.processed, events.length);
  assert.deepEqual(await snapshot(), first);
});

test("a crash between claim and processed_at is retried and ends correct", async () => {
  const s = await session(5, bench, [[130, 5]]);
  const expectedBefore = await recordsFor(s.setIds[0]!);
  assert.equal(expectedBefore.length, 0, "not processed yet");

  const child = spawn("node", ["tests/crash-worker.ts"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout!.on("data", (chunk: Buffer) => chunk.toString().includes("claimed") && resolve());
    child.on("exit", () => reject(new Error("crash worker exited early")));
  });

  // While the child holds the claim, SKIP LOCKED hides the row from another worker.
  assert.equal((await processBatch(db, quiet)).claimed, 0);

  child.kill("SIGKILL");
  await once(child, "exit");

  // The killed transaction rolled back: the event is unprocessed with no attempt counted.
  const [row] = await db.select().from(outbox).where(sql`${outbox.processedAt} is null`);
  assert.ok(row, "event is still pending");
  assert.equal(row.attempts, 0);

  // Postgres may take a moment to notice the dropped connection and release its locks.
  let result = { claimed: 0, processed: 0, failed: 0 };
  for (let i = 0; i < 50 && !result.processed; i++) {
    result = await drain(db, quiet);
    if (!result.processed) await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(result.processed, 1);
  assert.deepEqual((await recordsFor(s.setIds[0]!)).map((r) => r.kind).sort(), ["e1rm", "weight"]);
});

test("a failing event backs off, then dead-letters after the attempt limit", async () => {
  await db.insert(outbox).values({ kind: "no_such_kind", payload: {} });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await processBatch(db, quiet);
    assert.equal(result.failed, 1);
    const [row] = await db.select().from(outbox).where(eq(outbox.kind, "no_such_kind"));
    assert.equal(row!.attempts, attempt);
    assert.match(row!.lastError!, /unknown event kind/);
    assert.ok(row!.availableAt.getTime() > Date.now(), "rescheduled into the future");
    // Make it due again instead of waiting out the backoff.
    await db.update(outbox).set({ availableAt: sql`now()` }).where(eq(outbox.id, row!.id));
  }
  assert.equal((await processBatch(db, quiet)).claimed, 0, "dead letters are not claimed");
  await db.delete(outbox).where(eq(outbox.kind, "no_such_kind"));
});

test("moving or deleting a finished session updates analyses", async () => {
  const old = await session(3, bench, [[140, 5]]);
  await drain(db, quiet);
  assert.equal((await recordsFor(old.setIds[0]!)).length, 2);

  // Move it before every other session: it becomes a baseline-era set, no longer a record.
  const moved = await api(`/api/workouts/${old.workoutId}`, {
    method: "PATCH",
    body: { startedAt: new Date(Date.now() - 400 * 86_400_000).toISOString() },
  });
  assert.equal(moved.status, 200);
  await drain(db, quiet);
  assert.equal((await recordsFor(old.setIds[0]!)).length, 0);

  const deleted = await api(`/api/workouts/${old.workoutId}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  await drain(db, quiet);
  const [row] = await db.select().from(exerciseAnalyses).where(eq(exerciseAnalyses.exerciseId, bench));
  assert.equal(Number(row!.bestValue), Math.round(130 * (1 + 5 / 30) * 100) / 100);
});

test("replay from scratch equals incremental processing", async () => {
  await drain(db, quiet);
  const incremental = await snapshot();
  assert.ok(incremental.records.length > 0);
  await replayAll(db);
  assert.deepEqual(await snapshot(), incremental);
});

/**
 * Replaces all training data with made-up history (`shared/demo.ts`), then rebuilds analyses.
 * For screenshots and local demos only: it wipes routines, workouts, sets, body weights and the
 * outbox, so it refuses any database whose name lacks "demo". Users and exercises are kept; run
 * `npm run db:migrate` and `npm run seed` against the same database first.
 */
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { buildDemoHistory } from "../shared/demo.ts";
import * as schema from "../server/utils/schema.ts";
import { replayAll } from "../worker/process.ts";

const url = process.env.DATABASE_URL;
if (!url || !/demo/i.test(new URL(url).pathname)) {
  console.error("DATABASE_URL must name a database containing \"demo\" (it is wiped), e.g. .../gym_demo");
  process.exit(1);
}

const db = drizzle(url, { schema });
const data = buildDemoHistory(new Date(), Number(process.env.DEMO_SEED ?? 1));

const names = [...new Set([
  ...data.routines.flatMap((r) => r.exercises.map((e) => e.name)),
  ...data.workouts.flatMap((w) => w.sets.map((s) => s.exercise)),
])];
const found = await db
  .select({ id: schema.exercises.id, name: schema.exercises.name })
  .from(schema.exercises)
  .where(inArray(schema.exercises.name, names));
const exerciseId = new Map(found.map((e) => [e.name, e.id]));
const missing = names.filter((n) => !exerciseId.has(n));
if (missing.length) {
  console.error(`missing exercises (run npm run seed first): ${missing.join(", ")}`);
  process.exit(1);
}
const idOf = (name: string) => exerciseId.get(name)!;
const num = (n: number | null) => (n === null ? null : String(n));

await db.transaction(async (tx) => {
  const { routines, routineExercises, workouts, sets, bodyWeights, outbox, personalRecords, exerciseAnalyses } = schema;
  await tx.execute(
    sql`truncate ${personalRecords}, ${exerciseAnalyses}, ${sets}, ${workouts}, ${routineExercises}, ${routines}, ${bodyWeights}, ${outbox}`,
  );

  const routineId = new Map<string, string>();
  for (const routine of data.routines) {
    const [row] = await tx.insert(routines).values({ name: routine.name, notes: routine.notes }).returning({ id: routines.id });
    routineId.set(routine.name, row!.id);
    await tx.insert(routineExercises).values(
      routine.exercises.map((e, position) => ({
        routineId: row!.id,
        exerciseId: idOf(e.name),
        position,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeightKg: num(e.targetWeightKg),
      })),
    );
  }

  for (const workout of data.workouts) {
    const [row] = await tx
      .insert(workouts)
      .values({
        routineId: routineId.get(workout.routine)!,
        startedAt: workout.startedAt,
        endedAt: workout.endedAt,
        notes: workout.notes,
      })
      .returning({ id: workouts.id });
    await tx.insert(sets).values(
      workout.sets.map((s) => ({
        exerciseId: idOf(s.exercise),
        workoutId: row!.id,
        reps: s.reps,
        weightKg: String(s.weightKg),
        performedAt: s.performedAt,
        rpe: num(s.rpe),
        durationSeconds: s.durationSeconds,
        distanceKm: num(s.distanceKm),
        notes: s.notes,
      })),
    );
  }

  await tx.insert(bodyWeights).values(data.bodyWeights.map((b) => ({ weightKg: String(b.weightKg), measuredAt: b.measuredAt })));
});

const analysed = await replayAll(db);
const setCount = data.workouts.reduce((n, w) => n + w.sets.length, 0);
console.log(
  `demo data: ${data.workouts.length} workouts, ${setCount} sets, ${data.bodyWeights.length} body weights; analyses rebuilt for ${analysed} exercises`,
);
await db.$client.end();

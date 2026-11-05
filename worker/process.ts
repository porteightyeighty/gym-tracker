/**
 * Outbox consumer. Runs under plain Node (type stripping), so imports are relative with `.ts`.
 *
 * The consumer is a function of current data, not of the event: an event only names the
 * exercises to look at, and each one is recomputed from all of its finished sets, replacing
 * whatever was stored. Duplicate, late or out-of-order events are therefore harmless, which is
 * what makes at-least-once delivery safe.
 */
import { and, asc, eq, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { analyseExercise } from "../shared/analysis.ts";
import { isCardio } from "../shared/equipment.ts";
import type { OutboxEvent } from "../shared/events.ts";
import * as schema from "../server/utils/schema.ts";

const { exerciseAnalyses, exercises, outbox, personalRecords, routineExercises, sets, workouts } = schema;

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type OutboxRow = typeof outbox.$inferSelect;

export const MAX_ATTEMPTS = 5;
export const BATCH_SIZE = 10;
const UUID = /^[0-9a-f-]{36}$/i;

/** Seconds before retry number `attempts + 1`: 2, 4, 8, 16, … capped at five minutes. */
export function backoffSeconds(attempts: number): number {
  return Math.min(2 ** attempts, 300);
}

export type Log = (level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) => void;

export const jsonLog: Log = (level, msg, fields = {}) => {
  const line = JSON.stringify({ level, msg, ...fields, time: new Date().toISOString() });
  if (level === "info") console.log(line);
  else console.error(line);
};

/** Recomputes one exercise's records and analysis from every finished set, replacing the old rows. */
export async function recomputeExercise(tx: Tx, exerciseId: string): Promise<void> {
  // Serialises concurrent recomputes of the same exercise; plain reads are not blocked.
  const [exercise] = await tx
    .select({ id: exercises.id, type: exercises.type })
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .for("update");
  if (!exercise) return; // deleted: its derived rows went with it (ON DELETE CASCADE)
  if (isCardio(exercise.type)) {
    // No PRs or targets for cardio; clears rows left over if its type was changed.
    await tx.delete(personalRecords).where(eq(personalRecords.exerciseId, exerciseId));
    await tx.delete(exerciseAnalyses).where(eq(exerciseAnalyses.exerciseId, exerciseId));
    return;
  }

  // Finished history only: sets in an open workout count once it is finished.
  const rows = await tx
    .select({
      id: sets.id,
      workoutId: sets.workoutId,
      routineId: workouts.routineId,
      weightKg: sets.weightKg,
      reps: sets.reps,
      performedAt: sets.performedAt,
      isWarmup: sets.isWarmup,
    })
    .from(sets)
    .leftJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(eq(sets.exerciseId, exerciseId), or(isNull(sets.workoutId), isNotNull(workouts.endedAt))));

  const targets = await tx
    .select({ routineId: routineExercises.routineId, targetReps: routineExercises.targetReps })
    .from(routineExercises)
    .where(eq(routineExercises.exerciseId, exerciseId))
    .orderBy(asc(routineExercises.position));
  const routineTargetReps = new Map<string, number | null>();
  for (const row of targets) {
    if (!routineTargetReps.has(row.routineId)) routineTargetReps.set(row.routineId, row.targetReps);
  }

  const { analysis, records } = analyseExercise({ equipment: exercise.type, sets: rows, routineTargetReps });

  await tx.delete(personalRecords).where(eq(personalRecords.exerciseId, exerciseId));
  await tx.delete(exerciseAnalyses).where(eq(exerciseAnalyses.exerciseId, exerciseId));
  if (!analysis.sessions) return;

  await tx.insert(exerciseAnalyses).values({
    exerciseId,
    mode: analysis.mode,
    sessions: analysis.sessions,
    bestValue: analysis.bestValue === null ? null : analysis.bestValue.toFixed(2),
    sessionsSinceBest: analysis.sessionsSinceBest,
    plateau: analysis.plateau,
    targetWeightKg: analysis.target ? analysis.target.weightKg.toFixed(2) : null,
    targetReps: analysis.target?.reps ?? null,
    repRangeLow: analysis.target?.repRange?.[0] ?? null,
    repRangeHigh: analysis.target?.repRange?.[1] ?? null,
    targetReason: analysis.target?.reason ?? null,
    lastSessionAt: analysis.lastSessionAt,
  });
  if (records.length) {
    await tx.insert(personalRecords).values(
      records.map((record) => ({
        exerciseId,
        setId: record.setId,
        kind: record.kind,
        reps: record.reps,
        weightKg: record.weightKg.toFixed(2),
        value: record.value.toFixed(2),
        performedAt: record.performedAt,
      })),
    );
  }
}

/** The exercises an event asks to recompute, resolved against current data. */
async function affectedExercises(tx: Tx, row: OutboxRow): Promise<string[]> {
  const event = { kind: row.kind, payload: row.payload } as OutboxEvent;
  switch (event.kind) {
    case "workout_finished": {
      const { workoutId } = event.payload ?? {};
      if (typeof workoutId !== "string" || !UUID.test(workoutId)) throw new Error("workout_finished: bad workoutId");
      // A workout deleted since then has no sets; its deletion wrote its own event.
      const found = await tx
        .selectDistinct({ exerciseId: sets.exerciseId })
        .from(sets)
        .where(eq(sets.workoutId, workoutId));
      return found.map((r) => r.exerciseId);
    }
    case "history_changed": {
      const ids = event.payload?.exerciseIds;
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
        throw new Error("history_changed: bad exerciseIds");
      }
      return ids;
    }
    default:
      throw new Error(`unknown event kind: ${row.kind}`);
  }
}

export async function handleEvent(tx: Tx, row: OutboxRow): Promise<void> {
  // Sorted, so two workers locking overlapping exercises always lock in the same order.
  const ids = [...new Set(await affectedExercises(tx, row))].sort();
  for (const id of ids) await recomputeExercise(tx, id);
}

export interface BatchOptions {
  batchSize?: number;
  log?: Log;
  /** Test hook: runs after the batch is claimed (rows locked), before any is handled. */
  afterClaim?: (rows: OutboxRow[]) => Promise<void>;
}

export interface BatchResult {
  claimed: number;
  processed: number;
  failed: number;
}

/**
 * Claims up to `batchSize` due events and handles each in its own savepoint, all inside one
 * transaction that holds the row locks. A crash anywhere before commit rolls the whole batch back
 * and releases the locks, so the events are claimed again: nothing is lost, and re-handling is
 * safe because handling is idempotent. A failing event rolls back only its own savepoint and is
 * rescheduled with backoff; after MAX_ATTEMPTS it stays unprocessed as a dead letter.
 */
export async function processBatch(db: Db, options: BatchOptions = {}): Promise<BatchResult> {
  const { batchSize = BATCH_SIZE, log = jsonLog, afterClaim } = options;

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outbox)
      .where(and(isNull(outbox.processedAt), lte(outbox.availableAt, sql`now()`), lt(outbox.attempts, MAX_ATTEMPTS)))
      .orderBy(asc(outbox.createdAt))
      .limit(batchSize)
      .for("update", { skipLocked: true });
    const result: BatchResult = { claimed: rows.length, processed: 0, failed: 0 };
    if (!rows.length) return result;
    await afterClaim?.(rows);

    for (const row of rows) {
      try {
        await tx.transaction(async (sp) => {
          await handleEvent(sp, row);
          await sp.update(outbox).set({ processedAt: sql`now()` }).where(eq(outbox.id, row.id));
        });
        result.processed += 1;
      } catch (err) {
        result.failed += 1;
        const attempts = row.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        await tx
          .update(outbox)
          .set({
            attempts,
            lastError: message.slice(0, 2000),
            availableAt: sql`now() + make_interval(secs => ${backoffSeconds(attempts)})`,
          })
          .where(eq(outbox.id, row.id));
        if (attempts >= MAX_ATTEMPTS) {
          log("error", "event dead-lettered", { id: row.id, kind: row.kind, attempts, error: message });
        } else {
          log("warn", "event failed, will retry", { id: row.id, kind: row.kind, attempts, error: message });
        }
      }
    }
    return result;
  });
}

/** Drains every due event; used by the tests and handy from a REPL. */
export async function drain(db: Db, options: BatchOptions = {}): Promise<BatchResult> {
  const total: BatchResult = { claimed: 0, processed: 0, failed: 0 };
  for (;;) {
    const result = await processBatch(db, options);
    total.claimed += result.claimed;
    total.processed += result.processed;
    total.failed += result.failed;
    if (!result.claimed || result.failed === result.claimed) return total;
  }
}

/** Rebuilds all derived rows from scratch in one transaction. Needed when a rule changes. */
export async function replayAll(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`truncate ${personalRecords}, ${exerciseAnalyses}`);
    const ids = await tx.select({ id: exercises.id }).from(exercises).orderBy(asc(exercises.id));
    for (const { id } of ids) await recomputeExercise(tx, id);
    return ids.length;
  });
}

export async function outboxStats(db: Db) {
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${outbox.processedAt} is null and ${outbox.attempts} < ${MAX_ATTEMPTS})::int`,
      dead: sql<number>`count(*) filter (where ${outbox.processedAt} is null and ${outbox.attempts} >= ${MAX_ATTEMPTS})::int`,
    })
    .from(outbox);
  return row ?? { pending: 0, dead: 0 };
}

/** Processed events are kept a while for debugging, then deleted. */
export async function pruneProcessed(db: Db, days = 14): Promise<void> {
  await db
    .delete(outbox)
    .where(and(isNotNull(outbox.processedAt), lt(outbox.processedAt, sql`now() - make_interval(days => ${days})`)));
}

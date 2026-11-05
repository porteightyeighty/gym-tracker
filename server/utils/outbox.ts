import { eq } from "drizzle-orm";
import type { OutboxEvent } from "../../shared/events.ts";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Records an event for the analysis worker. Always pass the transaction that makes the change,
 * so the event exists if and only if the change committed.
 */
export async function enqueue<E extends OutboxEvent>(tx: Tx, kind: E["kind"], payload: E["payload"]) {
  await tx.insert(outbox).values({ kind, payload });
}

export async function enqueueHistoryChanged(tx: Tx, exerciseIds: Iterable<string>) {
  const ids = [...new Set(exerciseIds)].sort();
  if (ids.length) await enqueue(tx, "history_changed", { exerciseIds: ids });
}

/** Distinct exercises logged in a workout. */
export async function workoutExerciseIds(tx: Tx, workoutId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ exerciseId: sets.exerciseId })
    .from(sets)
    .where(eq(sets.workoutId, workoutId));
  return rows.map((row) => row.exerciseId);
}

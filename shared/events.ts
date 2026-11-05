/** Outbox event kinds. Payloads only say *what* changed; the worker reads current data itself. */
export type OutboxEvent =
  | { kind: "workout_finished"; payload: { workoutId: string } }
  | { kind: "history_changed"; payload: { exerciseIds: string[] } };

export type OutboxKind = OutboxEvent["kind"];

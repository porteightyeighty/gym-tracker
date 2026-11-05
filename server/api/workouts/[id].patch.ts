import { eq, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid workout id" });
  }

  const input = parseUpdateWorkoutInput(await readBody(event));
  const [existing] = await db.select().from(workouts).where(eq(workouts.id, id));
  if (!existing) throw createError({ statusCode: 404, statusMessage: "Workout not found" });

  const { deltaMs, startedAt, endedAt } = shiftSession(
    { startedAt: existing.startedAt, endedAt: existing.endedAt },
    input,
  );

  const update: { startedAt?: Date; endedAt?: Date; notes?: string | null } = {};
  if (input.notes !== undefined) update.notes = input.notes;
  if (deltaMs) {
    update.startedAt = startedAt;
    if (endedAt) update.endedAt = endedAt;
  }
  if (input.endedAt) {
    if (input.endedAt < startedAt) {
      throw createError({ statusCode: 400, statusMessage: "Workout cannot end before it starts" });
    }
    // Finishing is idempotent: keep the first end time.
    if (!existing.endedAt) update.endedAt = input.endedAt;
  }

  if (!Object.keys(update).length) return existing;

  return db.transaction(async (tx) => {
    if (deltaMs) {
      await tx
        .update(sets)
        .set({ performedAt: sql`${sets.performedAt} + make_interval(secs => ${deltaMs / 1000})` })
        .where(eq(sets.workoutId, id));
    }
    if (update.endedAt && !existing.endedAt) {
      // Finishing an empty workout is a discard, not a session worth keeping.
      const [set] = await tx.select({ id: sets.id }).from(sets).where(eq(sets.workoutId, id)).limit(1);
      if (!set) {
        await tx.delete(workouts).where(eq(workouts.id, id));
        return { deleted: true };
      }
      // First finish only: later PATCHes keep the first end time and write no event.
      await enqueue(tx, "workout_finished", { workoutId: id });
    } else if (deltaMs && existing.endedAt) {
      // Moving a finished session reorders history, which can move records and targets.
      await enqueueHistoryChanged(tx, await workoutExerciseIds(tx, id));
    }
    const [row] = await tx.update(workouts).set(update).where(eq(workouts.id, id)).returning();
    return row;
  });
});

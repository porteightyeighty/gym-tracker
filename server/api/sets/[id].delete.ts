import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid set id" });
  }

  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(sets)
      .where(eq(sets.id, id))
      .returning({ exerciseId: sets.exerciseId, workoutId: sets.workoutId });
    if (!deleted) return;

    let inHistory = !deleted.workoutId;
    if (deleted.workoutId) {
      const [workout] = await tx
        .select({ endedAt: workouts.endedAt })
        .from(workouts)
        .where(eq(workouts.id, deleted.workoutId));
      inHistory = Boolean(workout?.endedAt);
    }
    if (inHistory) await enqueueHistoryChanged(tx, [deleted.exerciseId]);
  });
  return { ok: true };
});

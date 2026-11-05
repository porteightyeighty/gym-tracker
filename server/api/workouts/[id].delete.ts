import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid workout id" });
  }

  const [existing] = await db.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, id));
  if (!existing) throw createError({ statusCode: 404, statusMessage: "Workout not found" });
  if (!existing.endedAt) {
    throw createError({ statusCode: 400, statusMessage: "Finish or discard the active workout first" });
  }

  await db.transaction(async (tx) => {
    await enqueueHistoryChanged(tx, await workoutExerciseIds(tx, id));
    await tx.delete(sets).where(eq(sets.workoutId, id));
    await tx.delete(workouts).where(eq(workouts.id, id));
  });

  return { deleted: true };
});

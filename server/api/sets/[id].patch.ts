import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid set id" });
  }

  const input = parseSetInput(await readBody(event));
  await assertSetMatchesExercise(input);
  if (input.workoutId) await assertWorkoutOpen(input.workoutId);

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ exerciseId: sets.exerciseId, workoutId: sets.workoutId, endedAt: workouts.endedAt })
        .from(sets)
        .leftJoin(workouts, eq(sets.workoutId, workouts.id))
        .where(eq(sets.id, id))
        .for("update", { of: sets });
      if (!existing) throw createError({ statusCode: 404, statusMessage: "Set not found" });

      // A set in finished history (or in no workout) feeds the analyses of its old and new exercise.
      if (!existing.workoutId || existing.endedAt) {
        await enqueueHistoryChanged(tx, [existing.exerciseId, input.exerciseId]);
      }
      const [row] = await tx.update(sets).set(input).where(eq(sets.id, id)).returning();
      return row;
    });
  } catch (err) {
    rethrowSetError(err);
  }
});

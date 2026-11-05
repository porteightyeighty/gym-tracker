import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const input = parseSetInput(await readBody(event));

  // A set lands in finished history (and so changes analyses) unless it joins an open workout.
  let intoHistory = false;
  if (input.workoutId) {
    // An explicit workout id may target a finished session (backfilling a set).
    const [target] = await db
      .select({ id: workouts.id, endedAt: workouts.endedAt })
      .from(workouts)
      .where(eq(workouts.id, input.workoutId))
      .limit(1);
    if (!target) throw createError({ statusCode: 400, statusMessage: "Unknown workout" });
    intoHistory = target.endedAt !== null;
  } else {
    const active = await findActiveWorkout();
    if (active) input.workoutId = active.id;
    else intoHistory = true;
  }

  try {
    return await db.transaction(async (tx) => {
      // Event first: if the insert then fails (unknown exercise), both roll back together.
      if (intoHistory) await enqueueHistoryChanged(tx, [input.exerciseId]);
      const [row] = await tx.insert(sets).values(input).returning();
      return row;
    });
  } catch (err) {
    rethrowSetError(err);
  }
});

import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const input = parseSetInput(await readBody(event));

  if (input.workoutId) {
    // An explicit workout id may target a finished session (backfilling a set).
    const [target] = await db
      .select({ id: workouts.id })
      .from(workouts)
      .where(eq(workouts.id, input.workoutId))
      .limit(1);
    if (!target) throw createError({ statusCode: 400, statusMessage: "Unknown workout" });
  } else {
    const active = await findActiveWorkout();
    if (active) input.workoutId = active.id;
  }

  try {
    const [row] = await db.insert(sets).values(input).returning();
    return row;
  } catch (err) {
    rethrowSetError(err);
  }
});

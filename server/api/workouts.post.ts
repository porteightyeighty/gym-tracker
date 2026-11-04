import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const body = await readBody(event);
  const input = parseStartWorkoutInput(body);

  const routineId = body?.routineId ?? null;
  if (routineId !== null && !isUuid(routineId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid routine" });
  }
  if (routineId) {
    const [routine] = await db
      .select({ id: routines.id })
      .from(routines)
      .where(eq(routines.id, routineId));
    if (!routine) throw createError({ statusCode: 400, statusMessage: "Unknown routine" });
  }

  // Starting twice returns the workout already in progress.
  const active = await findActiveWorkout();
  if (active) {
    if (routineId && active.routineId !== routineId) {
      throw createError({ statusCode: 409, statusMessage: "Finish the current workout first" });
    }
    return active;
  }

  const [row] = await db.insert(workouts).values({ ...input, routineId }).returning();
  return row;
});

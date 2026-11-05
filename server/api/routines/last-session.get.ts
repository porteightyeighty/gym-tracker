import { asc, eq } from "drizzle-orm";
import { summariseSession } from "~~/shared/routines";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const query = getQuery(event);
  const routineId = query.routineId ? String(query.routineId) : undefined;
  if (routineId && !isUuid(routineId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid routine id" });
  }

  const workout = await findLastWorkout(routineId);
  if (!workout) return { workoutId: null, startedAt: null, exercises: [] };

  const rows = await db
    .select({
      exerciseId: sets.exerciseId,
      exerciseName: exercises.name,
      exerciseType: exercises.type,
      weightKg: sets.weightKg,
      reps: sets.reps,
    })
    .from(sets)
    .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
    .where(eq(sets.workoutId, workout.id))
    .orderBy(asc(sets.performedAt), asc(sets.createdAt));

  return {
    workoutId: workout.id,
    startedAt: workout.startedAt,
    exercises: summariseSession(rows),
  };
});

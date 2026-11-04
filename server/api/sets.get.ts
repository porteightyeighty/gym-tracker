import { desc, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const query = getQuery(event);
  const limit = Math.min(Math.max(Math.trunc(Number(query.limit)) || 20, 1), 100);
  const offset = Math.max(Math.trunc(Number(query.offset)) || 0, 0);

  const rows = await db
    .select({
      id: sets.id,
      exerciseId: sets.exerciseId,
      workoutId: sets.workoutId,
      reps: sets.reps,
      weightKg: sets.weightKg,
      performedAt: sets.performedAt,
      notes: sets.notes,
      rpe: sets.rpe,
      isWarmup: sets.isWarmup,
      exerciseName: exercises.name,
      exerciseType: exercises.type,
      workoutStartedAt: workouts.startedAt,
      workoutEndedAt: workouts.endedAt,
      workoutNotes: workouts.notes,
    })
    .from(sets)
    .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
    .leftJoin(workouts, eq(sets.workoutId, workouts.id))
    .orderBy(desc(sets.performedAt), desc(sets.createdAt))
    .limit(limit + 1)
    .offset(offset);

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
});

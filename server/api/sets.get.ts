import { desc, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  return db
    .select({
      id: sets.id,
      reps: sets.reps,
      weightKg: sets.weightKg,
      performedAt: sets.performedAt,
      exerciseName: exercises.name,
      exerciseType: exercises.type,
    })
    .from(sets)
    .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
    .orderBy(desc(sets.performedAt))
    .limit(20);
});

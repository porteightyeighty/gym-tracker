import { desc, eq, isNull } from "drizzle-orm";

export async function findActiveWorkout() {
  const [row] = await db
    .select()
    .from(workouts)
    .where(isNull(workouts.endedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  return row ?? null;
}

export async function assertWorkoutOpen(id: string) {
  const [row] = await db
    .select({ endedAt: workouts.endedAt })
    .from(workouts)
    .where(eq(workouts.id, id))
    .limit(1);
  if (!row) throw createError({ statusCode: 400, statusMessage: "Unknown workout" });
  if (row.endedAt) throw createError({ statusCode: 400, statusMessage: "Workout already finished" });
}

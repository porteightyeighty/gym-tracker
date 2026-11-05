import { asc, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid exercise id" });
  }

  const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id));
  if (!exercise) {
    throw createError({ statusCode: 404, statusMessage: "Exercise not found" });
  }

  const rows = await db
    .select({
      id: sets.id,
      reps: sets.reps,
      weightKg: sets.weightKg,
      performedAt: sets.performedAt,
      notes: sets.notes,
      rpe: sets.rpe,
      durationSeconds: sets.durationSeconds,
      distanceKm: sets.distanceKm,
    })
    .from(sets)
    .where(eq(sets.exerciseId, id))
    .orderBy(asc(sets.performedAt))
    .limit(1000); // shortcut: history capped at 1000 sets, paginate if an exercise ever exceeds that

  return { exercise, sets: rows };
});

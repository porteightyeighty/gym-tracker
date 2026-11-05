import { desc, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid exercise id" });
  }

  const [row] = await db
    .select({
      reps: sets.reps,
      weightKg: sets.weightKg,
      durationSeconds: sets.durationSeconds,
      distanceKm: sets.distanceKm,
      performedAt: sets.performedAt,
    })
    .from(sets)
    .where(eq(sets.exerciseId, id))
    .orderBy(desc(sets.performedAt))
    .limit(1);

  return row ?? null;
});

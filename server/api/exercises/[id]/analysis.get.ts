import { asc, eq } from "drizzle-orm";

/** Worker-derived analysis for one exercise; `analysis` is null until the worker has run for it. */
export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid exercise id" });
  }

  const [[analysis], records] = await Promise.all([
    db.select().from(exerciseAnalyses).where(eq(exerciseAnalyses.exerciseId, id)),
    db
      .select({
        setId: personalRecords.setId,
        kind: personalRecords.kind,
        reps: personalRecords.reps,
        weightKg: personalRecords.weightKg,
        value: personalRecords.value,
        performedAt: personalRecords.performedAt,
      })
      .from(personalRecords)
      .where(eq(personalRecords.exerciseId, id))
      .orderBy(asc(personalRecords.performedAt)),
  ]);

  return { analysis: analysis ?? null, records };
});

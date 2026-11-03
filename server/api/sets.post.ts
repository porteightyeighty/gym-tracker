export default defineEventHandler(async (event) => {
  await requireSession(event);
  const body = await readBody(event);

  const exerciseId = typeof body?.exerciseId === "string" ? body.exerciseId : "";
  const reps = Number(body?.reps);
  const weightKg = Number(body?.weightKg);
  const performedAt = new Date(body?.performedAt);

  if (!/^[0-9a-f-]{36}$/i.test(exerciseId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid exercise" });
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > 1000) {
    throw createError({ statusCode: 400, statusMessage: "Reps must be a positive integer" });
  }
  if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 9999) {
    throw createError({ statusCode: 400, statusMessage: "Weight must be between 0 and 9999 kg" });
  }
  if (Number.isNaN(performedAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }

  const [row] = await db
    .insert(sets)
    .values({ exerciseId, reps, weightKg: weightKg.toFixed(2), performedAt })
    .returning();

  return row;
});

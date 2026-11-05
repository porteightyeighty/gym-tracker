import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid routine id" });
  }
  await db.transaction(async (tx) => {
    // Its sessions lose their routine, and with it the routine's rep range for targets.
    const rows = await tx
      .select({ exerciseId: routineExercises.exerciseId })
      .from(routineExercises)
      .where(eq(routineExercises.routineId, id));
    await enqueueHistoryChanged(tx, rows.map((row) => row.exerciseId));
    await tx.delete(routines).where(eq(routines.id, id));
  });
  return { ok: true };
});

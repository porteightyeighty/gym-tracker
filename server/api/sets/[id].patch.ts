import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid set id" });
  }

  const input = parseSetInput(await readBody(event));
  if (input.workoutId) await assertWorkoutOpen(input.workoutId);

  try {
    const [row] = await db.update(sets).set(input).where(eq(sets.id, id)).returning();
    if (!row) throw createError({ statusCode: 404, statusMessage: "Set not found" });
    return row;
  } catch (err) {
    rethrowSetError(err);
  }
});

import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid workout id" });
  }

  const input = parseUpdateWorkoutInput(await readBody(event));
  const [existing] = await db.select().from(workouts).where(eq(workouts.id, id));
  if (!existing) throw createError({ statusCode: 404, statusMessage: "Workout not found" });

  const update: { endedAt?: Date; notes?: string | null } = {};
  if (input.notes !== undefined) update.notes = input.notes;
  if (input.endedAt) {
    if (input.endedAt < existing.startedAt) {
      throw createError({ statusCode: 400, statusMessage: "Workout cannot end before it starts" });
    }
    // Finishing is idempotent: keep the first end time.
    if (!existing.endedAt) update.endedAt = input.endedAt;
  }

  if (!Object.keys(update).length) return existing;
  const [row] = await db.update(workouts).set(update).where(eq(workouts.id, id)).returning();
  return row;
});

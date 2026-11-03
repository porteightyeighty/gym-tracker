import { isEquipment } from "~~/shared/equipment";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const body = await readBody(event);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw createError({ statusCode: 400, statusMessage: "Name is required" });
  if (!isEquipment(body?.type)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid equipment type" });
  }

  const [row] = await db
    .insert(exercises)
    .values({ name, type: body.type })
    .onConflictDoNothing()
    .returning();

  if (!row) throw createError({ statusCode: 409, statusMessage: "Exercise already exists" });
  return row;
});

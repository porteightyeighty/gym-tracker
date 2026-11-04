import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid body weight id" });
  }
  await db.delete(bodyWeights).where(eq(bodyWeights.id, id));
  return { ok: true };
});

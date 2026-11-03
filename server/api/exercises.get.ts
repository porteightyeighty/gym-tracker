import { asc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  return db.select().from(exercises).orderBy(asc(exercises.type), asc(exercises.name));
});

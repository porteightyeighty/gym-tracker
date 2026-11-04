import { desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const query = getQuery(event);
  const limit = Math.min(Math.max(Math.trunc(Number(query.limit)) || 30, 1), 100);
  const offset = Math.max(Math.trunc(Number(query.offset)) || 0, 0);

  const rows = await db
    .select()
    .from(bodyWeights)
    .orderBy(desc(bodyWeights.measuredAt), desc(bodyWeights.createdAt))
    .limit(limit + 1)
    .offset(offset);

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
});

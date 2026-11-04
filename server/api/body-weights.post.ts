export default defineEventHandler(async (event) => {
  await requireSession(event);
  const input = parseBodyWeightInput(await readBody(event));
  const [row] = await db.insert(bodyWeights).values(input).returning();
  return row;
});

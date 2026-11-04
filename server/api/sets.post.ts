export default defineEventHandler(async (event) => {
  await requireSession(event);
  const input = parseSetInput(await readBody(event));

  try {
    const [row] = await db.insert(sets).values(input).returning();
    return row;
  } catch (err) {
    rethrowSetError(err);
  }
});

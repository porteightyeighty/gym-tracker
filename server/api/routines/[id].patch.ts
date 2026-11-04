export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid routine id" });
  }

  const input = parseRoutineInput(await readBody(event));

  try {
    const row = await replaceRoutine(id, input);
    if (!row) throw createError({ statusCode: 404, statusMessage: "Routine not found" });
    return row;
  } catch (err) {
    rethrowRoutineError(err);
  }
});

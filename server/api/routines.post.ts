export default defineEventHandler(async (event) => {
  await requireSession(event);
  const input = parseRoutineInput(await readBody(event));

  try {
    return await createRoutine(input);
  } catch (err) {
    rethrowRoutineError(err);
  }
});

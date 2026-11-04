export default defineEventHandler(async (event) => {
  await requireSession(event);
  const input = parseSetInput(await readBody(event));

  if (input.workoutId) {
    await assertWorkoutOpen(input.workoutId);
  } else {
    const active = await findActiveWorkout();
    if (active) input.workoutId = active.id;
  }

  try {
    const [row] = await db.insert(sets).values(input).returning();
    return row;
  } catch (err) {
    rethrowSetError(err);
  }
});

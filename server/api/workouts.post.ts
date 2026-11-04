export default defineEventHandler(async (event) => {
  await requireSession(event);
  const input = parseStartWorkoutInput(await readBody(event));

  // Starting twice returns the workout already in progress.
  const active = await findActiveWorkout();
  if (active) return active;

  const [row] = await db.insert(workouts).values(input).returning();
  return row;
});

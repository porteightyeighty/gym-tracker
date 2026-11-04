export default defineEventHandler(async (event) => {
  await requireSession(event);
  return findActiveWorkout();
});

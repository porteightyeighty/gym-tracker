import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { lastFinishedSession } from "~~/shared/analysis";

/** The sets of this exercise's most recent finished session, oldest first; the current one is skipped. */
export default defineEventHandler(async (event) => {
  await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid exercise id" });
  }

  // Newest first, so the window always holds the latest sessions whole.
  const rows = await db
    .select({
      id: sets.id,
      workoutId: sets.workoutId,
      routineId: workouts.routineId,
      reps: sets.reps,
      weightKg: sets.weightKg,
      durationSeconds: sets.durationSeconds,
      distanceKm: sets.distanceKm,
      performedAt: sets.performedAt,
    })
    .from(sets)
    .leftJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(eq(sets.exerciseId, id), or(isNull(sets.workoutId), isNotNull(workouts.endedAt))))
    .orderBy(desc(sets.performedAt))
    .limit(100);

  const session = lastFinishedSession(rows, new Date());
  if (!session.length) return null;
  return {
    startedAt: session[0]!.performedAt,
    sets: session.map(({ reps, weightKg, durationSeconds, distanceKm }) => ({
      reps,
      weightKg,
      durationSeconds,
      distanceKm,
    })),
  };
});

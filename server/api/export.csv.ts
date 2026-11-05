import { asc, eq } from "drizzle-orm";
import { toCsv } from "~~/shared/csv";
import { e1rm } from "~~/shared/progress";

export default defineEventHandler(async (event) => {
  await requireSession(event);

  const rows = await db
    .select({
      performedAt: sets.performedAt,
      exercise: exercises.name,
      type: exercises.type,
      weightKg: sets.weightKg,
      reps: sets.reps,
      rpe: sets.rpe,
      durationSeconds: sets.durationSeconds,
      distanceKm: sets.distanceKm,
      notes: sets.notes,
      workoutStartedAt: workouts.startedAt,
    })
    .from(sets)
    .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
    .leftJoin(workouts, eq(sets.workoutId, workouts.id))
    .orderBy(asc(sets.performedAt), asc(sets.createdAt));

  const csv = toCsv(
    [
      "performed_at",
      "exercise",
      "equipment",
      "weight_kg",
      "reps",
      "e1rm",
      "volume",
      "duration_seconds",
      "distance_km",
      "rpe",
      "notes",
      "workout_started_at",
    ],
    rows.map((row) => [
      row.performedAt.toISOString(),
      row.exercise,
      row.type,
      row.weightKg,
      row.reps,
      row.durationSeconds === null ? e1rm(Number(row.weightKg), row.reps).toFixed(2) : "",
      row.durationSeconds === null ? (Number(row.weightKg) * row.reps).toFixed(2) : "",
      row.durationSeconds ?? "",
      row.distanceKm ?? "",
      row.rpe ?? "",
      row.notes ?? "",
      row.workoutStartedAt?.toISOString() ?? "",
    ]),
  );

  setHeader(event, "content-type", "text/csv; charset=utf-8");
  setHeader(event, "content-disposition", 'attachment; filename="gym-tracker.csv"');
  return csv;
});

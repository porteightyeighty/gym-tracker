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
      isWarmup: sets.isWarmup,
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
      "rpe",
      "is_warmup",
      "notes",
      "workout_started_at",
    ],
    rows.map((row) => [
      row.performedAt.toISOString(),
      row.exercise,
      row.type,
      row.weightKg,
      row.reps,
      e1rm(Number(row.weightKg), row.reps).toFixed(2),
      (Number(row.weightKg) * row.reps).toFixed(2),
      row.rpe ?? "",
      row.isWarmup,
      row.notes ?? "",
      row.workoutStartedAt?.toISOString() ?? "",
    ]),
  );

  setHeader(event, "content-type", "text/csv; charset=utf-8");
  setHeader(event, "content-disposition", 'attachment; filename="gym-tracker.csv"');
  return csv;
});

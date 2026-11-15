import { formatSetLoad, type LoadLike } from "./cardio.ts";

export interface SummarySet extends LoadLike {
  exerciseId: string;
  exerciseName: string;
  performedAt: string | Date;
}

export interface WorkoutSummary {
  sets: number;
  volumeKg: number;
  exercises: { exerciseId: string; name: string; loads: string[] }[];
}

/** A finished-session recap: exercises in the order first done, each with its sets in order. */
export function summariseWorkout(rows: SummarySet[]): WorkoutSummary {
  const ordered = [...rows].sort(
    (a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime(),
  );
  const byExercise = new Map<string, WorkoutSummary["exercises"][number]>();
  let volumeKg = 0;
  for (const row of ordered) {
    let entry = byExercise.get(row.exerciseId);
    if (!entry) {
      entry = { exerciseId: row.exerciseId, name: row.exerciseName, loads: [] };
      byExercise.set(row.exerciseId, entry);
    }
    entry.loads.push(formatSetLoad(row));
    if (row.durationSeconds == null) volumeKg += Number(row.weightKg) * row.reps;
  }
  return { sets: ordered.length, volumeKg: Math.round(volumeKg), exercises: [...byExercise.values()] };
}

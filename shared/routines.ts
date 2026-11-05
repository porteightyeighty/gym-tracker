export interface SessionSet {
  exerciseId: string;
  exerciseName: string;
  exerciseType: string;
  weightKg: string | number;
  reps: number;
}

export interface RoutineExerciseDraft {
  exerciseId: string;
  name: string;
  type: string;
  targetSets: number;
  targetReps: number;
  targetWeightKg: string;
}

export function summariseSession(rows: SessionSet[]): RoutineExerciseDraft[] {
  const byExercise = new Map<
    string,
    RoutineExerciseDraft & { topWeight: number; topReps: number }
  >();

  for (const row of rows) {
    const weight = Number(row.weightKg);
    const existing = byExercise.get(row.exerciseId);

    if (!existing) {
      byExercise.set(row.exerciseId, {
        exerciseId: row.exerciseId,
        name: row.exerciseName,
        type: row.exerciseType,
        targetSets: 1,
        targetReps: row.reps,
        targetWeightKg: weight.toFixed(2),
        topWeight: weight,
        topReps: row.reps,
      });
      continue;
    }

    existing.targetSets += 1;
    if (weight > existing.topWeight || (weight === existing.topWeight && row.reps > existing.topReps)) {
      existing.topWeight = weight;
      existing.topReps = row.reps;
      existing.targetReps = row.reps;
      existing.targetWeightKg = weight.toFixed(2);
    }
  }

  return [...byExercise.values()].map((entry) => ({
    exerciseId: entry.exerciseId,
    name: entry.name,
    type: entry.type,
    targetSets: entry.targetSets,
    targetReps: entry.targetReps,
    targetWeightKg: entry.targetWeightKg,
  }));
}

export function formatTarget(
  targetSets: number | null,
  targetReps: number | null,
  targetWeightKg: string | number | null,
): string {
  const parts: string[] = [];
  if (targetSets) parts.push(targetReps ? `${targetSets}×${targetReps}` : `${targetSets} sets`);
  else if (targetReps) parts.push(`${targetReps} reps`);
  if (targetWeightKg !== null && Number(targetWeightKg) > 0) {
    parts.push(`${Number(targetWeightKg)} kg`);
  }
  return parts.join(" · ");
}

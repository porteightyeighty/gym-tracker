import { and, asc, desc, eq, exists, isNotNull, sql } from "drizzle-orm";
import type { RoutineInput } from "./routineInput.ts";

export interface RoutineExerciseRow {
  id: string;
  exerciseId: string;
  name: string;
  type: string;
  position: number;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightKg: string | null;
}

export interface RoutineRow {
  id: string;
  name: string;
  notes: string | null;
  exercises: RoutineExerciseRow[];
}

export async function listRoutines(): Promise<RoutineRow[]> {
  const routineRows = await db
    .select({ id: routines.id, name: routines.name, notes: routines.notes })
    .from(routines)
    .orderBy(asc(routines.name));

  const exerciseRows = await db
    .select({
      id: routineExercises.id,
      routineId: routineExercises.routineId,
      exerciseId: routineExercises.exerciseId,
      name: exercises.name,
      type: exercises.type,
      position: routineExercises.position,
      targetSets: routineExercises.targetSets,
      targetReps: routineExercises.targetReps,
      targetWeightKg: routineExercises.targetWeightKg,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .orderBy(asc(routineExercises.position));

  const byRoutine = new Map<string, RoutineExerciseRow[]>();
  for (const { routineId, ...row } of exerciseRows) {
    const list = byRoutine.get(routineId);
    if (list) list.push(row);
    else byRoutine.set(routineId, [row]);
  }

  return routineRows.map((routine) => ({
    ...routine,
    exercises: byRoutine.get(routine.id) ?? [],
  }));
}

function exerciseValues(routineId: string, input: RoutineInput) {
  return input.exercises.map((row, index) => ({
    routineId,
    exerciseId: row.exerciseId,
    position: index,
    targetSets: row.targetSets,
    targetReps: row.targetReps,
    targetWeightKg: row.targetWeightKg,
  }));
}

export async function createRoutine(input: RoutineInput) {
  return db.transaction(async (tx) => {
    const [routine] = await tx
      .insert(routines)
      .values({ name: input.name, notes: input.notes })
      .returning();
    if (!routine) throw createError({ statusCode: 500, statusMessage: "Could not create routine" });
    if (input.exercises.length) {
      await tx.insert(routineExercises).values(exerciseValues(routine.id, input));
    }
    return routine;
  });
}

export async function replaceRoutine(id: string, input: RoutineInput) {
  return db.transaction(async (tx) => {
    const [routine] = await tx
      .update(routines)
      .set({ name: input.name, notes: input.notes })
      .where(eq(routines.id, id))
      .returning();
    if (!routine) return null;

    // Target reps set the rep range for sessions from this routine, so analyses can change.
    const previous = await tx
      .select({ exerciseId: routineExercises.exerciseId })
      .from(routineExercises)
      .where(eq(routineExercises.routineId, id));
    await enqueueHistoryChanged(tx, [
      ...previous.map((row) => row.exerciseId),
      ...input.exercises.map((row) => row.exerciseId),
    ]);

    await tx.delete(routineExercises).where(eq(routineExercises.routineId, id));
    if (input.exercises.length) {
      await tx.insert(routineExercises).values(exerciseValues(id, input));
    }
    return routine;
  });
}

export async function findLastWorkout(routineId?: string) {
  // An ended workout with no sets (started, then finished by mistake) must not shadow a real session.
  const hasSets = exists(db.select({ one: sql`1` }).from(sets).where(eq(sets.workoutId, workouts.id)));

  if (routineId) {
    const [byRoutine] = await db
      .select()
      .from(workouts)
      .where(and(eq(workouts.routineId, routineId), isNotNull(workouts.endedAt), hasSets))
      .orderBy(desc(workouts.startedAt))
      .limit(1);
    if (byRoutine) return byRoutine;
  }

  const [latest] = await db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), hasSets))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  return latest ?? null;
}

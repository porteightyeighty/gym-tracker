import { createError } from "h3";
import { isUuid } from "./setInput.ts";

const MAX_NAME = 100;
const MAX_NOTES = 2000;
const MAX_EXERCISES = 100;

export interface RoutineExerciseInput {
  exerciseId: string;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightKg: string | null;
}

export interface RoutineInput {
  name: string;
  notes: string | null;
  exercises: RoutineExerciseInput[];
}

function optionalInteger(value: unknown, min: number, max: number, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw createError({ statusCode: 400, statusMessage: `${label} must be between ${min} and ${max}` });
  }
  return number;
}

export function parseRoutineInput(body: any): RoutineInput {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw createError({ statusCode: 400, statusMessage: "Name is required" });
  if (name.length > MAX_NAME) {
    throw createError({ statusCode: 400, statusMessage: `Name must be at most ${MAX_NAME} characters` });
  }

  let notes: string | null = null;
  if (body?.notes !== undefined && body?.notes !== null) {
    if (typeof body.notes !== "string") {
      throw createError({ statusCode: 400, statusMessage: "Notes must be text" });
    }
    const trimmed = body.notes.trim();
    if (trimmed.length > MAX_NOTES) {
      throw createError({ statusCode: 400, statusMessage: `Notes must be at most ${MAX_NOTES} characters` });
    }
    notes = trimmed || null;
  }

  if (!Array.isArray(body?.exercises)) {
    throw createError({ statusCode: 400, statusMessage: "Exercises must be a list" });
  }
  if (body.exercises.length > MAX_EXERCISES) {
    throw createError({ statusCode: 400, statusMessage: `A routine can hold at most ${MAX_EXERCISES} exercises` });
  }

  const exercises = body.exercises.map((row: any): RoutineExerciseInput => {
    if (!isUuid(row?.exerciseId)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid exercise" });
    }

    let targetWeightKg: string | null = null;
    const targetWeight = row?.targetWeightKg;
    if (targetWeight !== undefined && targetWeight !== null && targetWeight !== "") {
      const value = Number(targetWeight);
      if (!Number.isFinite(value) || value < 0 || value > 9999) {
        throw createError({
          statusCode: 400,
          statusMessage: "Target weight must be between 0 and 9999 kg",
        });
      }
      targetWeightKg = value.toFixed(2);
    }

    return {
      exerciseId: row.exerciseId,
      targetSets: optionalInteger(row?.targetSets, 1, 100, "Target sets"),
      targetReps: optionalInteger(row?.targetReps, 1, 1000, "Target reps"),
      targetWeightKg,
    };
  });

  return { name, notes, exercises };
}

export function rethrowRoutineError(err: unknown): never {
  let current: unknown = err;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    if ((current as { code?: string }).code === "23503") {
      throw createError({ statusCode: 400, statusMessage: "Unknown exercise" });
    }
    current = (current as { cause?: unknown }).cause;
  }
  throw err;
}

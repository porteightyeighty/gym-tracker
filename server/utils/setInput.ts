import { createError } from "h3";
import { MAX_DURATION_SECONDS } from "../../shared/cardio.ts";

const MAX_NOTES = 500;

export interface SetInput {
  exerciseId: string;
  workoutId?: string;
  reps: number;
  weightKg: string;
  performedAt: Date;
  notes: string | null;
  rpe: string | null;
  isWarmup: boolean;
  durationSeconds: number | null;
  distanceKm: string | null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export function parseSetInput(body: any): SetInput {
  const exerciseId = typeof body?.exerciseId === "string" ? body.exerciseId : "";
  const workoutId = body?.workoutId;
  // A duration makes this a cardio entry: reps and weight are stored as 0 and not validated.
  // Whether the exercise really is cardio is checked against the database by the route.
  const cardio = body?.durationSeconds !== undefined && body?.durationSeconds !== null;
  const reps = cardio ? 0 : Number(body?.reps);
  const weightKg = cardio ? 0 : Number(body?.weightKg);
  const performedAt = new Date(body?.performedAt);

  if (!isUuid(exerciseId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid exercise" });
  }
  if (workoutId !== undefined && workoutId !== null && !isUuid(workoutId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid workout" });
  }
  let durationSeconds: number | null = null;
  let distanceKm: string | null = null;
  if (cardio) {
    durationSeconds = Number(body.durationSeconds);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > MAX_DURATION_SECONDS) {
      throw createError({ statusCode: 400, statusMessage: "Duration must be between 1 second and 24 hours" });
    }
    if (body?.distanceKm !== undefined && body?.distanceKm !== null && body?.distanceKm !== "") {
      const distance = Number(body.distanceKm);
      if (!Number.isFinite(distance) || distance < 0 || distance > 1000) {
        throw createError({ statusCode: 400, statusMessage: "Distance must be between 0 and 1000 km" });
      }
      distanceKm = distance.toFixed(2);
    }
  } else if (!Number.isInteger(reps) || reps < 1 || reps > 1000) {
    throw createError({ statusCode: 400, statusMessage: "Reps must be a positive integer" });
  }
  if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 9999) {
    throw createError({ statusCode: 400, statusMessage: "Weight must be between 0 and 9999 kg" });
  }
  if (Number.isNaN(performedAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
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

  let rpe: string | null = null;
  if (body?.rpe !== undefined && body?.rpe !== null && body?.rpe !== "") {
    const value = Number(body.rpe);
    if (!Number.isFinite(value) || value < 1 || value > 10) {
      throw createError({ statusCode: 400, statusMessage: "RPE must be between 1 and 10" });
    }
    rpe = value.toFixed(1);
  }

  const isWarmup = body?.isWarmup ?? false;
  if (typeof isWarmup !== "boolean") {
    throw createError({ statusCode: 400, statusMessage: "isWarmup must be a boolean" });
  }

  return {
    exerciseId,
    workoutId: isUuid(workoutId) ? workoutId : undefined,
    reps,
    weightKg: weightKg.toFixed(2),
    performedAt,
    notes,
    rpe,
    isWarmup: cardio ? false : isWarmup,
    durationSeconds,
    distanceKm,
  };
}

export function rethrowSetError(err: unknown): never {
  let current: unknown = err;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    if ((current as { code?: string }).code === "23503") {
      throw createError({ statusCode: 400, statusMessage: "Unknown exercise" });
    }
    current = (current as { cause?: unknown }).cause;
  }
  throw err;
}

import { createError } from "h3";

export interface SetInput {
  exerciseId: string;
  reps: number;
  weightKg: string;
  performedAt: Date;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export function parseSetInput(body: any): SetInput {
  const exerciseId = typeof body?.exerciseId === "string" ? body.exerciseId : "";
  const reps = Number(body?.reps);
  const weightKg = Number(body?.weightKg);
  const performedAt = new Date(body?.performedAt);

  if (!isUuid(exerciseId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid exercise" });
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > 1000) {
    throw createError({ statusCode: 400, statusMessage: "Reps must be a positive integer" });
  }
  if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 9999) {
    throw createError({ statusCode: 400, statusMessage: "Weight must be between 0 and 9999 kg" });
  }
  if (Number.isNaN(performedAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }

  return { exerciseId, reps, weightKg: weightKg.toFixed(2), performedAt };
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

import { createError } from "h3";

export interface BodyWeightInput {
  weightKg: string;
  measuredAt: Date;
}

export function parseBodyWeightInput(body: any): BodyWeightInput {
  const weight = Number(body?.weightKg);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 999) {
    throw createError({ statusCode: 400, statusMessage: "Weight must be between 0 and 999 kg" });
  }

  const measuredAt = new Date(body?.measuredAt);
  if (Number.isNaN(measuredAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }

  return { weightKg: weight.toFixed(2), measuredAt };
}

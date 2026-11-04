import { createError } from "h3";

const MAX_NOTES = 2000;

export interface WorkoutUpdate {
  startedAt?: Date;
  endedAt?: Date;
  notes?: string | null;
}

function parseDate(value: unknown, message: string): Date {
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw createError({ statusCode: 400, statusMessage: message });
  }
  return date;
}

function parseNotes(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw createError({ statusCode: 400, statusMessage: "Notes must be text" });
  }
  const notes = value.trim();
  if (notes.length > MAX_NOTES) {
    throw createError({ statusCode: 400, statusMessage: `Notes must be at most ${MAX_NOTES} characters` });
  }
  return notes || null;
}

export function parseStartWorkoutInput(body: any) {
  const startedAt =
    body?.startedAt === undefined || body?.startedAt === null
      ? new Date()
      : parseDate(body.startedAt, "Invalid start date");
  const notes = body && "notes" in body ? parseNotes(body.notes) : null;
  return { startedAt, notes };
}

export function parseUpdateWorkoutInput(body: any): WorkoutUpdate {
  if (!body || typeof body !== "object") return {};
  const input: WorkoutUpdate = {};
  if (body.startedAt !== undefined && body.startedAt !== null) {
    input.startedAt = parseDate(body.startedAt, "Invalid start date");
  }
  if (body.endedAt !== undefined && body.endedAt !== null) {
    input.endedAt = parseDate(body.endedAt, "Invalid end date");
  }
  if ("notes" in body) input.notes = parseNotes(body.notes);
  return input;
}

/** Moves a session and everything in it by the same offset, so the sets stay on the session. */
export function shiftSession(
  existing: { startedAt: Date; endedAt: Date | null },
  input: WorkoutUpdate,
) {
  const deltaMs = input.startedAt ? input.startedAt.getTime() - existing.startedAt.getTime() : 0;
  const startedAt = new Date(existing.startedAt.getTime() + deltaMs);
  const endedAt = existing.endedAt ? new Date(existing.endedAt.getTime() + deltaMs) : null;
  if (endedAt && endedAt < startedAt) {
    throw createError({ statusCode: 400, statusMessage: "Workout cannot end before it starts" });
  }
  return { deltaMs, startedAt, endedAt };
}

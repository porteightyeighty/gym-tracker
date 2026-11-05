/** Duration and distance helpers for cardio entries. Pure, so `npm run check` covers them. */

export const MAX_DURATION_SECONDS = 24 * 60 * 60;

/**
 * "27:56" → 1676, "1:02:03" → 3723, "28" → 1680 (a bare number is minutes). Returns null for
 * anything else, including zero.
 */
export function parseDuration(text: string): number | null {
  const value = text.trim();
  let seconds: number;
  if (/^\d+(\.\d+)?$/.test(value)) {
    seconds = Math.round(Number(value) * 60);
  } else if (/^\d+:[0-5]\d$/.test(value)) {
    const [m, s] = value.split(":").map(Number);
    seconds = m! * 60 + s!;
  } else if (/^\d+:[0-5]\d:[0-5]\d$/.test(value)) {
    const [h, m, s] = value.split(":").map(Number);
    seconds = h! * 3600 + m! * 60 + s!;
  } else {
    return null;
  }
  return seconds > 0 && seconds <= MAX_DURATION_SECONDS ? seconds : null;
}

/** 1676 → "27:56", 3723 → "1:02:03". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export interface LoadLike {
  reps: number;
  weightKg: string | number;
  durationSeconds?: number | null;
  distanceKm?: string | number | null;
}

/** How a set reads in lists: "27:56 · 3.2 km" for cardio, "40 kg × 10" otherwise. */
export function formatSetLoad(row: LoadLike): string {
  if (row.durationSeconds != null) {
    const distance = row.distanceKm != null && Number(row.distanceKm) > 0 ? ` · ${Number(row.distanceKm)} km` : "";
    return formatDuration(row.durationSeconds) + distance;
  }
  return `${Number(row.weightKg)} kg × ${row.reps}`;
}

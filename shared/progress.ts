export interface ProgressSet {
  weightKg: string | number;
  reps: number;
  performedAt: string | Date;
}

export interface DayStats<T extends ProgressSet = ProgressSet> {
  key: string;
  date: Date;
  topWeight: number;
  volume: number;
  bestE1rm: number;
  sets: T[];
}

export function e1rm(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayStats<T extends ProgressSet>(rows: T[]): DayStats<T>[] {
  const byDay = new Map<string, DayStats<T>>();

  for (const row of rows) {
    const performedAt = new Date(row.performedAt);
    if (Number.isNaN(performedAt.getTime())) continue;

    const key = localDayKey(performedAt);
    const weight = Number(row.weightKg);
    let stats = byDay.get(key);
    if (!stats) {
      stats = {
        key,
        date: new Date(performedAt.getFullYear(), performedAt.getMonth(), performedAt.getDate()),
        topWeight: 0,
        volume: 0,
        bestE1rm: 0,
        sets: [],
      };
      byDay.set(key, stats);
    }

    stats.topWeight = Math.max(stats.topWeight, weight);
    stats.volume += weight * row.reps;
    stats.bestE1rm = Math.max(stats.bestE1rm, e1rm(weight, row.reps));
    stats.sets.push(row);
  }

  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

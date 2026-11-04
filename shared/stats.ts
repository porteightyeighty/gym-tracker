export function dayKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function streak(days: string[], today: string): number {
  const trained = new Set(days);
  const cursor = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime())) return 0;

  // A streak survives until the end of today, so yesterday still counts.
  if (!trained.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let count = 0;
  while (trained.has(cursor.toISOString().slice(0, 10))) {
    count += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

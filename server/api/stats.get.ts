import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { dayKeyInZone, streak } from "~~/shared/stats";

function queryDate(value: unknown, fallback: Date): Date {
  if (value === undefined || value === null || value === "") return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "Invalid date" });
  }
  return date;
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export default defineEventHandler(async (event) => {
  await requireSession(event);
  const query = getQuery(event);

  const to = queryDate(query.to, new Date());
  const from = queryDate(query.from, new Date(to.getTime() - 12 * 7 * 24 * 60 * 60 * 1000));
  if (from >= to) throw createError({ statusCode: 400, statusMessage: "from must be before to" });

  const tz = typeof query.tz === "string" && query.tz ? query.tz : "UTC";
  if (!isTimeZone(tz)) throw createError({ statusCode: 400, statusMessage: "Invalid timezone" });

  const range = and(
    gte(sets.performedAt, from),
    lt(sets.performedAt, to),
    eq(sets.isWarmup, false),
  );

  const week = sql<string>`to_char(date_trunc('week', ${sets.performedAt} AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
  const localDay = sql<string>`to_char(${sets.performedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;

  const [weekly, equipment, dayRows] = await Promise.all([
    db
      .select({
      week,
      volume: sql<number>`coalesce(sum(${sets.weightKg} * ${sets.reps}), 0)::float8`,
      sets: sql<number>`count(*)::int`,
    })
      .from(sets)
      .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
      .where(and(range, ne(exercises.type, "cardio"))) // cardio has no sets or volume
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ type: exercises.type, sets: sql<number>`count(*)::int` })
      .from(sets)
      .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
      .where(and(range, ne(exercises.type, "cardio")))
      .groupBy(exercises.type)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ day: localDay })
      .from(sets)
      .where(and(lt(sets.performedAt, to), eq(sets.isWarmup, false)))
      .groupBy(sql`1`)
      .orderBy(sql`1 desc`)
      .limit(366), // shortcut: streak sees at most the last 366 training days
  ]);

  const days = dayRows.map((row) => row.day);
  const fromKey = dayKeyInZone(from, tz);
  const today = dayKeyInZone(new Date(), tz);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    weekly,
    equipment,
    totals: {
      sets: weekly.reduce((sum, row) => sum + row.sets, 0),
      days: days.filter((day) => day >= fromKey).length,
      volume: weekly.reduce((sum, row) => sum + row.volume, 0),
      streak: streak(days, today),
    },
  };
});

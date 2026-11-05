/**
 * Workout analysis rules, as pure functions of an exercise's finished history. The worker calls
 * `analyseExercise` with every set of one exercise and replaces whatever it stored before, so the
 * result depends only on current data, never on which event triggered it.
 */
import { weightIncrement } from "./equipment.ts";
import { e1rm } from "./progress.ts";

export const PLATEAU_SESSIONS = 4;
export const DEFAULT_REP_RANGE: RepRange = [8, 12];
/** Sets outside a workout (legacy, or logged with no session open) this close together form one session. */
export const LOOSE_SESSION_GAP_MS = 3 * 60 * 60 * 1000;

export type RepRange = [low: number, high: number];
export type AnalysisMode = "load" | "reps";
export type RecordKind = "e1rm" | "weight" | "reps";

export interface AnalysisSet {
  id: string;
  workoutId: string | null;
  routineId: string | null;
  weightKg: string | number;
  reps: number;
  performedAt: string | Date;
}

export interface WorkingSet {
  id: string;
  weightKg: number;
  reps: number;
  performedAt: Date;
  e1rm: number;
}

export interface Session {
  key: string;
  routineId: string | null;
  startedAt: Date;
  sets: WorkingSet[];
}

export interface PersonalRecord {
  setId: string;
  kind: RecordKind;
  reps: number;
  weightKg: number;
  value: number;
  performedAt: Date;
}

export interface Target {
  weightKg: number;
  reps: number;
  repRange: RepRange | null;
  reason: string;
}

export interface ExerciseAnalysis {
  mode: AnalysisMode;
  sessions: number;
  bestValue: number | null;
  sessionsSinceBest: number;
  plateau: boolean;
  target: Target | null;
  lastSessionAt: Date | null;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareSets(a: WorkingSet, b: WorkingSet) {
  return a.performedAt.getTime() - b.performedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Sets grouped into sessions, oldest first. Sets in a workout group by workout; sets with no
 * workout group by time gaps, which avoids picking a timezone for "same day".
 */
export function groupSessions(rows: AnalysisSet[]): Session[] {
  const byWorkout = new Map<string, Session>();
  const loose: { set: WorkingSet; routineId: string | null }[] = [];

  for (const row of rows) {
    const performedAt = new Date(row.performedAt);
    if (Number.isNaN(performedAt.getTime())) continue;
    const weightKg = Number(row.weightKg);
    const set: WorkingSet = {
      id: row.id,
      weightKg,
      reps: row.reps,
      performedAt,
      e1rm: round2(e1rm(weightKg, row.reps)),
    };

    if (!row.workoutId) {
      loose.push({ set, routineId: row.routineId });
      continue;
    }
    let session = byWorkout.get(row.workoutId);
    if (!session) {
      session = { key: `workout:${row.workoutId}`, routineId: row.routineId, startedAt: performedAt, sets: [] };
      byWorkout.set(row.workoutId, session);
    }
    session.sets.push(set);
  }

  const sessions = [...byWorkout.values()];
  loose.sort((a, b) => compareSets(a.set, b.set));
  let current: Session | null = null;
  let lastAt = 0;
  for (const { set } of loose) {
    if (!current || set.performedAt.getTime() - lastAt > LOOSE_SESSION_GAP_MS) {
      current = { key: `loose:${set.id}`, routineId: null, startedAt: set.performedAt, sets: [] };
      sessions.push(current);
    }
    current.sets.push(set);
    lastAt = set.performedAt.getTime();
  }

  for (const session of sessions) {
    session.sets.sort(compareSets);
    session.startedAt = session.sets[0]!.performedAt;
  }
  return sessions.sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime() || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** "reps" when every working set is at 0 kg (bodyweight); otherwise load, scored by e1RM. */
export function analysisMode(sessions: Session[]): AnalysisMode {
  return sessions.some((s) => s.sets.some((set) => set.weightKg > 0)) ? "load" : "reps";
}

function sessionScore(session: Session, mode: AnalysisMode): number {
  return Math.max(...session.sets.map((set) => (mode === "load" ? set.e1rm : set.reps)));
}

/** First set in session order with the highest value; ties go to the earlier set. */
function bestBy(items: WorkingSet[], value: (set: WorkingSet) => number): WorkingSet | null {
  let best: WorkingSet | null = null;
  for (const set of items) if (!best || value(set) > value(best)) best = set;
  return best;
}

/**
 * A record is the best set of a session that strictly beats every earlier session. The first
 * session sets the baseline and earns no records; neither does a tie, nor a rep count never done
 * before. At most one set per kind (and per rep count for "weight") per session.
 *
 * - e1rm: best estimated 1RM (Epley), load mode only.
 * - weight: heaviest weight at an exact rep count, load mode only.
 * - reps: most reps in a set, reps mode (0 kg) only.
 */
export function personalRecords(sessions: Session[], mode: AnalysisMode): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  let bestE1rm: number | null = null;
  let bestReps: number | null = null;
  const bestWeightAt = new Map<number, number>();

  const record = (set: WorkingSet, kind: RecordKind, value: number) =>
    records.push({ setId: set.id, kind, reps: set.reps, weightKg: set.weightKg, value, performedAt: set.performedAt });

  for (const session of sessions) {
    if (mode === "reps") {
      const top = bestBy(session.sets, (set) => set.reps)!;
      if (bestReps !== null && top.reps > bestReps) record(top, "reps", top.reps);
      bestReps = Math.max(bestReps ?? 0, top.reps);
      continue;
    }

    const top = bestBy(session.sets, (set) => set.e1rm)!;
    if (bestE1rm !== null && top.e1rm > bestE1rm) record(top, "e1rm", top.e1rm);
    bestE1rm = Math.max(bestE1rm ?? 0, top.e1rm);

    const repCounts = [...new Set(session.sets.map((set) => set.reps))].sort((a, b) => a - b);
    for (const reps of repCounts) {
      const heaviest = bestBy(
        session.sets.filter((set) => set.reps === reps),
        (set) => set.weightKg,
      )!;
      const previous = bestWeightAt.get(reps);
      if (previous !== undefined && heaviest.weightKg > previous) record(heaviest, "weight", heaviest.weightKg);
      bestWeightAt.set(reps, Math.max(previous ?? 0, heaviest.weightKg));
    }
  }
  return records;
}

/**
 * Sessions since the last one that set a new best score (e1RM, or reps at 0 kg). A plateau is
 * PLATEAU_SESSIONS or more sessions in a row without beating it, so it needs at least
 * PLATEAU_SESSIONS + 1 sessions.
 */
export function plateauStatus(sessions: Session[], mode: AnalysisMode, n = PLATEAU_SESSIONS) {
  let best: number | null = null;
  let bestIndex = -1;
  sessions.forEach((session, index) => {
    const score = sessionScore(session, mode);
    if (best === null || score > best) {
      best = score;
      bestIndex = index;
    }
  });
  const sessionsSinceBest = bestIndex < 0 ? 0 : sessions.length - 1 - bestIndex;
  return { bestValue: best as number | null, sessionsSinceBest, plateau: sessionsSinceBest >= n };
}

/** A routine's target reps is the top of the range, three below it the bottom; otherwise 8–12. */
export function repRangeFor(routineTargetReps: number | null | undefined): RepRange {
  if (!routineTargetReps || routineTargetReps < 1) return DEFAULT_REP_RANGE;
  return [Math.max(1, routineTargetReps - 3), routineTargetReps];
}

function kg(value: number) {
  return `${round2(value)} kg`;
}

/**
 * Double progression from the last session. Only the sets at that session's top weight count
 * (lighter back-off sets don't hold the progression back):
 * - all of them reached the top of the rep range → add one increment for the equipment type and
 *   go back to the bottom of the range;
 * - otherwise → same weight, one more rep than the weakest of them, capped at the top.
 * At 0 kg (reps mode) the target is one rep more than the best set, with no range.
 */
export function nextTarget(last: Session, mode: AnalysisMode, equipment: string, range: RepRange): Target {
  if (mode === "reps") {
    const best = Math.max(...last.sets.map((set) => set.reps));
    return { weightKg: 0, reps: best + 1, repRange: null, reason: `Best set last time was ${best} reps: aim for one more.` };
  }

  const [low, high] = range;
  const topWeight = Math.max(...last.sets.map((set) => set.weightKg));
  const atTop = last.sets.filter((set) => set.weightKg === topWeight);
  const weakest = Math.min(...atTop.map((set) => set.reps));

  if (weakest >= high) {
    const increment = weightIncrement(equipment);
    return {
      weightKg: round2(topWeight + increment),
      reps: low,
      repRange: range,
      reason: `Every set at ${kg(topWeight)} reached ${high} reps last time: add ${kg(increment)}.`,
    };
  }
  return {
    weightKg: topWeight,
    reps: Math.min(high, weakest + 1),
    repRange: range,
    reason: `Same weight; build towards ${high} reps on every set at ${kg(topWeight)}.`,
  };
}

export interface AnalyseInput {
  equipment: string;
  sets: AnalysisSet[];
  /** routineId → target reps for this exercise in that routine. */
  routineTargetReps?: Map<string, number | null>;
}

export function analyseExercise(input: AnalyseInput): { analysis: ExerciseAnalysis; records: PersonalRecord[] } {
  const sessions = groupSessions(input.sets);
  const mode = analysisMode(sessions);
  const last = sessions.at(-1) ?? null;
  const { bestValue, sessionsSinceBest, plateau } = plateauStatus(sessions, mode);
  const range = repRangeFor(last?.routineId ? input.routineTargetReps?.get(last.routineId) : null);

  return {
    analysis: {
      mode,
      sessions: sessions.length,
      bestValue,
      sessionsSinceBest,
      plateau,
      target: last ? nextTarget(last, mode, input.equipment, range) : null,
      lastSessionAt: last ? last.startedAt : null,
    },
    records: personalRecords(sessions, mode),
  };
}

export function recordLabel(kind: string, reps: number): string {
  if (kind === "e1rm") return "e1RM PR";
  if (kind === "weight") return `${reps}-rep PR`;
  return "Rep PR";
}

export function formatSuggestion(weightKg: string | number | null, reps: number | null): string {
  if (reps === null) return "";
  const weight = Number(weightKg ?? 0);
  return weight > 0 ? `${round2(weight)} kg × ${reps}` : `${reps} reps`;
}

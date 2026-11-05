/**
 * Made-up training history for screenshots and local demos: about twelve weeks of a push/pull/legs
 * routine with double progression, one stalled lift (so a plateau shows), some cardio and
 * body weights. Pure and deterministic: the same `now` and `seed` give the same data, and every
 * timestamp is before `now`, with the last session a day or two earlier.
 *
 * Exercises are referenced by name and must exist in the seeded list (`scripts/seed.ts`).
 */
import { weightIncrement } from "./equipment.ts";

export interface DemoSet {
  exercise: string;
  reps: number;
  weightKg: number;
  performedAt: Date;
  rpe: number | null;
  durationSeconds: number | null;
  distanceKm: number | null;
  notes: string | null;
}

export interface DemoWorkout {
  routine: string;
  startedAt: Date;
  endedAt: Date;
  notes: string | null;
  sets: DemoSet[];
}

export interface DemoRoutine {
  name: string;
  notes: string | null;
  exercises: { name: string; targetSets: number; targetReps: number; targetWeightKg: number | null }[];
}

export interface DemoData {
  routines: DemoRoutine[];
  workouts: DemoWorkout[];
  bodyWeights: { weightKg: number; measuredAt: Date }[];
}

interface Lift {
  name: string;
  equipment: string;
  startKg: number;
  /** Top of the rep range; the bottom is three below, matching `repRangeFor`. */
  topReps: number;
  sets: number;
  /** Stops improving for this many final sessions. */
  stallLast?: number;
}

const ROUTINES: { name: string; notes: string | null; lifts: Lift[] }[] = [
  {
    name: "Push",
    notes: "Chest, shoulders, triceps",
    lifts: [
      { name: "Bench press", equipment: "barbell", startKg: 60, topReps: 8, sets: 3 },
      { name: "Overhead press", equipment: "barbell", startKg: 37.5, topReps: 8, sets: 3, stallLast: 5 },
      { name: "Incline dumbbell press", equipment: "dumbbell", startKg: 22, topReps: 10, sets: 3 },
      { name: "Lateral raise", equipment: "dumbbell", startKg: 8, topReps: 15, sets: 3 },
      { name: "Cable triceps pushdown", equipment: "cable", startKg: 25, topReps: 12, sets: 3 },
    ],
  },
  {
    name: "Pull",
    notes: "Back and biceps",
    lifts: [
      { name: "Pull-up", equipment: "bodyweight", startKg: 0, topReps: 0, sets: 3 },
      { name: "Barbell row", equipment: "barbell", startKg: 55, topReps: 8, sets: 3 },
      { name: "Lat pulldown", equipment: "cable", startKg: 50, topReps: 10, sets: 3 },
      { name: "Seated cable row", equipment: "cable", startKg: 50, topReps: 12, sets: 3 },
      { name: "Dumbbell curl", equipment: "dumbbell", startKg: 12, topReps: 12, sets: 3 },
    ],
  },
  {
    name: "Legs",
    notes: null,
    lifts: [
      { name: "Back squat", equipment: "barbell", startKg: 80, topReps: 6, sets: 3 },
      { name: "Romanian deadlift", equipment: "barbell", startKg: 70, topReps: 8, sets: 3 },
      { name: "Leg press", equipment: "machine", startKg: 140, topReps: 12, sets: 3 },
      { name: "Leg curl", equipment: "machine", startKg: 40, topReps: 12, sets: 3 },
      { name: "Standing calf raise", equipment: "machine", startKg: 60, topReps: 15, sets: 3 },
    ],
  },
];

const WORKOUT_NOTES = ["Felt strong today", "Short on sleep, kept it steady", "Busy gym, swapped the order around"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

/** mulberry32: small, seedable, good enough for made-up data. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildDemoHistory(now: Date, seed = 1, weeks = 12): DemoData {
  const rand = prng(seed);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const span = weeks * 7;

  // Training days, counted back from today: Mon/Wed/Fri, sometimes Saturday, occasionally skipped.
  const days: number[] = [];
  for (let k = span; k >= 1; k--) {
    const weekday = new Date(today - k * DAY_MS).getUTCDay();
    const planned = weekday === 1 || weekday === 3 || weekday === 5 || (weekday === 6 && rand() < 0.25);
    if (planned && rand() >= 0.08) days.push(k);
  }
  if (days.length === 0 || days[days.length - 1]! > 2) days.push(1); // never looks abandoned

  // Per-routine session counts, so a stall can be placed at the end of a lift's history.
  const routineOf = (index: number) => ROUTINES[index % ROUTINES.length]!;
  const sessionsPerRoutine = new Map<string, number>();
  days.forEach((_, i) => sessionsPerRoutine.set(routineOf(i).name, (sessionsPerRoutine.get(routineOf(i).name) ?? 0) + 1));

  const state = new Map<string, { weight: number; reps: number }>();
  for (const routine of ROUTINES) {
    for (const lift of routine.lifts) {
      state.set(lift.name, { weight: lift.startKg, reps: lift.topReps ? lift.topReps - 3 : 6 });
    }
  }
  const sessionIndex = new Map<string, number>();

  const workouts: DemoWorkout[] = days.map((k, i) => {
    const routine = routineOf(i);
    const n = sessionIndex.get(routine.name) ?? 0;
    sessionIndex.set(routine.name, n + 1);
    const total = sessionsPerRoutine.get(routine.name)!;

    const startedAt = new Date(today - k * DAY_MS + (17 * 60 + Math.floor(rand() * 120)) * MIN_MS);
    let t = startedAt.getTime() + 5 * MIN_MS;
    const sets: DemoSet[] = [];

    for (const lift of routine.lifts) {
      const s = state.get(lift.name)!;
      const stalled = lift.stallLast !== undefined && n >= total - lift.stallLast;
      const low = lift.topReps - 3;

      // Steady progress (a rep a session, then more weight), so only a lift with `stallLast`
      // plateaus: a slower pace could leave any lift four sessions short of a new best.
      if (n > 0 && !stalled) {
        if (lift.topReps === 0) {
          if (n % 2 === 0) s.reps += 1; // bodyweight: reps only
        } else if (s.reps >= lift.topReps) {
          s.weight = round2(s.weight + weightIncrement(lift.equipment));
          s.reps = low;
        } else {
          s.reps += 1;
        }
      }

      for (let j = 0; j < lift.sets; j++) {
        let reps: number;
        if (lift.topReps === 0) reps = j === 0 ? s.reps : s.reps - 1;
        else if (stalled) reps = s.reps - 1; // below the last good session, so no new best
        else reps = j === 0 && rand() < 0.4 ? Math.min(lift.topReps, s.reps + 1) : s.reps;

        const last = j === lift.sets - 1;
        sets.push({
          exercise: lift.name,
          reps,
          weightKg: s.weight,
          performedAt: new Date(t),
          rpe: last && rand() < 0.7 ? 7.5 + Math.floor(rand() * 5) * 0.5 : null,
          durationSeconds: null,
          distanceKm: null,
          notes: stalled && last && n === total - 1 ? "Grinding, shoulders tired" : null,
        });
        t += (2.5 + rand()) * MIN_MS;
      }
      t += 2 * MIN_MS;
    }

    if ((routine.name === "Legs" && rand() < 0.5) || (routine.name === "Pull" && rand() < 0.3)) {
      const treadmill = routine.name === "Legs";
      const minutes = 15 + Math.floor(rand() * 16);
      const kmh = treadmill ? 8.5 + rand() * 2 : 22 + rand() * 6;
      sets.push({
        exercise: treadmill ? "Treadmill" : "Exercise bike",
        reps: 0,
        weightKg: 0,
        performedAt: new Date(t),
        rpe: null,
        durationSeconds: minutes * 60,
        distanceKm: round2((kmh * minutes) / 60),
        notes: null,
      });
      t += minutes * MIN_MS;
    }

    return {
      routine: routine.name,
      startedAt,
      endedAt: new Date(t + 4 * MIN_MS),
      notes: i % 11 === 5 ? WORKOUT_NOTES[Math.floor(i / 11) % WORKOUT_NOTES.length]! : null,
      sets,
    };
  });

  // Body weight every two to four days, drifting down about 2 kg with day-to-day noise.
  const bodyWeights: DemoData["bodyWeights"] = [];
  for (let k = span; k >= 0; k -= 2 + Math.floor(rand() * 3)) {
    const progress = 1 - k / span;
    const measuredAt = new Date(today - k * DAY_MS + 7 * 60 * MIN_MS);
    if (measuredAt >= now) continue;
    bodyWeights.push({ weightKg: round1(82.4 - 2.2 * progress + (rand() - 0.5) * 0.8), measuredAt });
  }

  // Targets are where each lift ended up, as if the routine had been kept up to date.
  const routines: DemoRoutine[] = ROUTINES.map((routine) => ({
    name: routine.name,
    notes: routine.notes,
    exercises: routine.lifts.map((lift) => ({
      name: lift.name,
      targetSets: lift.sets,
      targetReps: lift.topReps || 10,
      targetWeightKg: lift.topReps ? state.get(lift.name)!.weight : null,
    })),
  }));

  return { routines, workouts, bodyWeights };
}

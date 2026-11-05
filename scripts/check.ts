import assert from "node:assert/strict";
import { parseBodyWeightInput } from "../server/utils/bodyWeightInput.ts";
import { parseRoutineInput } from "../server/utils/routineInput.ts";
import { parseSetInput } from "../server/utils/setInput.ts";
import {
  parseStartWorkoutInput,
  parseUpdateWorkoutInput,
  shiftSession,
} from "../server/utils/workoutInput.ts";
import { dayStats, e1rm } from "../shared/progress.ts";
import { formatTarget, summariseSession } from "../shared/routines.ts";
import { dayKeyInZone, streak } from "../shared/stats.ts";
import { toCsv } from "../shared/csv.ts";
import { formatDuration, formatSetLoad, parseDuration } from "../shared/cardio.ts";
import {
  analyseExercise,
  groupSessions,
  nextTarget,
  personalRecords,
  plateauStatus,
  repRangeFor,
  type AnalysisSet,
} from "../shared/analysis.ts";
import { weightIncrement } from "../shared/equipment.ts";

const valid = {
  exerciseId: "123e4567-e89b-12d3-a456-426614174000",
  reps: 5,
  weightKg: 100,
  performedAt: "2026-11-04T10:00:00.000Z",
};

const parsed = parseSetInput(valid);
assert.equal(parsed.weightKg, "100.00");
assert.equal(parsed.reps, 5);
assert.ok(parsed.performedAt instanceof Date);

for (const bad of [
  { ...valid, reps: 0 },
  { ...valid, reps: 1.5 },
  { ...valid, weightKg: -1 },
  { ...valid, weightKg: "heavy" },
  { ...valid, performedAt: "not a date" },
  { ...valid, exerciseId: "nope" },
  { ...valid, workoutId: "nope" },
  { ...valid, notes: 42 },
  { ...valid, notes: "x".repeat(501) },
  { ...valid, rpe: 0 },
  { ...valid, rpe: 11 },
  { ...valid, rpe: "hard" },
  { ...valid, isWarmup: "yes" },
]) {
  assert.throws(
    () => parseSetInput(bad),
    (err: any) => err.statusCode === 400,
  );
}

// Cardio: a duration replaces weight × reps; reps and weight are stored as 0, never a warm-up.
assert.equal(parsed.durationSeconds, null);
assert.equal(parsed.distanceKm, null);
const cardio = parseSetInput({ ...valid, reps: undefined, weightKg: undefined, durationSeconds: 1676, distanceKm: 3.2, isWarmup: true });
assert.deepEqual([cardio.reps, cardio.weightKg, cardio.durationSeconds, cardio.distanceKm, cardio.isWarmup], [0, "0.00", 1676, "3.20", false]);
assert.equal(parseSetInput({ ...valid, durationSeconds: 60, distanceKm: "" }).distanceKm, null);
for (const bad of [
  { ...valid, durationSeconds: 0 },
  { ...valid, durationSeconds: 1.5 },
  { ...valid, durationSeconds: 24 * 3600 + 1 },
  { ...valid, durationSeconds: "long" },
  { ...valid, durationSeconds: 60, distanceKm: -1 },
  { ...valid, durationSeconds: 60, distanceKm: "far" },
]) {
  assert.throws(() => parseSetInput(bad), (err: any) => err.statusCode === 400);
}

assert.equal(parseDuration("27:56"), 1676);
assert.equal(parseDuration(" 1:02:03 "), 3723);
assert.equal(parseDuration("28"), 1680);
assert.equal(parseDuration("2.5"), 150);
for (const bad of ["", "0", "0:00", "1:60", "abc", "1:2", "-5", "25:00:00"]) assert.equal(parseDuration(bad), null, bad);
assert.equal(formatDuration(1676), "27:56");
assert.equal(formatDuration(3723), "1:02:03");
assert.equal(formatDuration(59), "0:59");
assert.equal(formatSetLoad({ reps: 0, weightKg: "0.00", durationSeconds: 978, distanceKm: "3.20" }), "16:18 · 3.2 km");
assert.equal(formatSetLoad({ reps: 0, weightKg: "0.00", durationSeconds: 978, distanceKm: null }), "16:18");
assert.equal(formatSetLoad({ reps: 10, weightKg: "27.50", durationSeconds: null }), "27.5 kg × 10");

const parsedMeta = parseSetInput({ ...valid, notes: "  hard  ", rpe: 7.5, isWarmup: true });
assert.equal(parsedMeta.notes, "hard");
assert.equal(parsedMeta.rpe, "7.5");
assert.equal(parsedMeta.isWarmup, true);

assert.equal(parseSetInput(valid).notes, null);
assert.equal(parseSetInput(valid).rpe, null);
assert.equal(parseSetInput(valid).isWarmup, false);
assert.equal(parseSetInput({ ...valid, rpe: "" }).rpe, null);

assert.equal(parseSetInput(valid).workoutId, undefined);
assert.equal(
  parseSetInput({ ...valid, workoutId: "123e4567-e89b-12d3-a456-426614174001" }).workoutId,
  "123e4567-e89b-12d3-a456-426614174001",
);

const started = parseStartWorkoutInput({ notes: "  legs  " });
assert.ok(started.startedAt instanceof Date);
assert.equal(started.notes, "legs");

const startedNow = parseStartWorkoutInput(undefined);
assert.ok(Date.now() - startedNow.startedAt.getTime() < 5000);
assert.equal(startedNow.notes, null);

assert.deepEqual(parseUpdateWorkoutInput({}), {});
const update = parseUpdateWorkoutInput({ endedAt: "2026-11-04T12:00:00.000Z", notes: null });
assert.ok(update.endedAt instanceof Date);
assert.equal(update.notes, null);

for (const bad of [
  () => parseStartWorkoutInput({ startedAt: "not a date" }),
  () => parseStartWorkoutInput({ notes: "x".repeat(2001) }),
  () => parseUpdateWorkoutInput({ endedAt: "not a date" }),
  () => parseUpdateWorkoutInput({ notes: 42 }),
]) {
  assert.throws(bad, (err: any) => err.statusCode === 400);
}

assert.equal(e1rm(100, 1), 100);
assert.ok(Math.abs(e1rm(100, 5) - 100 * (1 + 5 / 30)) < 1e-9);

const days = dayStats([
  { weightKg: "100.00", reps: 5, performedAt: new Date(2026, 0, 1, 9) },
  { weightKg: "110.00", reps: 3, performedAt: new Date(2026, 0, 1, 18) },
  { weightKg: "90.00", reps: 8, performedAt: new Date(2026, 0, 3, 9) },
]);

assert.equal(days.length, 2);
assert.equal(days[0].key, "2026-01-01");
assert.equal(days[0].topWeight, 110);
assert.equal(days[0].volume, 100 * 5 + 110 * 3);
assert.ok(Math.abs(days[0].bestE1rm - e1rm(110, 3)) < 1e-9);
assert.equal(days[1].key, "2026-01-03");

const routine = parseRoutineInput({
  name: "  Push  ",
  notes: "  chest  ",
  exercises: [
    { exerciseId: valid.exerciseId, targetSets: 3, targetReps: "8", targetWeightKg: 80 },
    { exerciseId: "123e4567-e89b-12d3-a456-426614174001", targetSets: "", targetReps: null },
  ],
});
assert.equal(routine.name, "Push");
assert.equal(routine.notes, "chest");
assert.equal(routine.exercises[0].targetSets, 3);
assert.equal(routine.exercises[0].targetReps, 8);
assert.equal(routine.exercises[0].targetWeightKg, "80.00");
assert.equal(routine.exercises[1].targetSets, null);
assert.equal(routine.exercises[1].targetWeightKg, null);

for (const bad of [
  { name: "", exercises: [] },
  { name: "Push" },
  { name: "Push", exercises: [{ exerciseId: "nope" }] },
  { name: "Push", exercises: [{ exerciseId: valid.exerciseId, targetSets: 0 }] },
  { name: "Push", exercises: [{ exerciseId: valid.exerciseId, targetReps: 1001 }] },
  { name: "Push", exercises: [{ exerciseId: valid.exerciseId, targetWeightKg: -1 }] },
]) {
  assert.throws(() => parseRoutineInput(bad), (err: any) => err.statusCode === 400);
}

const summary = summariseSession([
  { exerciseId: "a", exerciseName: "Bench", exerciseType: "barbell", weightKg: "100.00", reps: 5 },
  { exerciseId: "a", exerciseName: "Bench", exerciseType: "barbell", weightKg: 105, reps: 3 },
  {
    exerciseId: "a",
    exerciseName: "Bench",
    exerciseType: "barbell",
    weightKg: 140,
    reps: 20,
    isWarmup: true,
  },
  { exerciseId: "b", exerciseName: "Row", exerciseType: "barbell", weightKg: "60.00", reps: 10 },
]);
assert.equal(summary.length, 2);
assert.equal(summary[0].exerciseId, "a");
assert.equal(summary[0].targetSets, 2);
assert.equal(summary[0].targetWeightKg, "105.00");
assert.equal(summary[0].targetReps, 3);
assert.equal(summary[1].name, "Row");

assert.equal(formatTarget(3, 8, "80.00"), "3×8 · 80 kg");
assert.equal(formatTarget(null, 10, null), "10 reps");
assert.equal(formatTarget(null, null, null), "");

assert.equal(dayKeyInZone(new Date("2026-11-04T23:30:00.000Z"), "UTC"), "2026-11-04");
assert.equal(dayKeyInZone(new Date("2026-11-04T23:30:00.000Z"), "Asia/Tokyo"), "2026-11-05");

assert.equal(streak([], "2026-11-04"), 0);
assert.equal(streak(["2026-11-04", "2026-11-03", "2026-11-01"], "2026-11-04"), 2);
assert.equal(streak(["2026-11-03", "2026-11-02"], "2026-11-04"), 2);
assert.equal(streak(["2026-11-01"], "2026-11-04"), 0);
assert.equal(streak(["2026-11-04", "2026-11-04", "2026-11-03"], "2026-11-04"), 2);

assert.equal(
  toCsv(
    ["a", "b"],
    [
      ["x,y", 'he said "hi"'],
      ["line\nbreak", 2],
    ],
  ),
  'a,b\r\n"x,y","he said ""hi"""\r\n"line\nbreak",2\r\n',
);
assert.equal(toCsv(["a"], [[null]]), "a\r\n\r\n");

const bodyWeight = parseBodyWeightInput({
  weightKg: 80.5,
  measuredAt: "2026-11-04T07:00:00.000Z",
});
assert.equal(bodyWeight.weightKg, "80.50");
assert.ok(bodyWeight.measuredAt instanceof Date);

for (const bad of [
  { weightKg: 0, measuredAt: "2026-11-04T07:00:00.000Z" },
  { weightKg: -1, measuredAt: "2026-11-04T07:00:00.000Z" },
  { weightKg: 1000, measuredAt: "2026-11-04T07:00:00.000Z" },
  { weightKg: "heavy", measuredAt: "2026-11-04T07:00:00.000Z" },
  { weightKg: 80, measuredAt: "nope" },
]) {
  assert.throws(() => parseBodyWeightInput(bad), (err: any) => err.statusCode === 400);
}

const session = {
  startedAt: new Date("2026-11-02T17:00:00.000Z"),
  endedAt: new Date("2026-11-02T17:54:00.000Z"),
};

const unchanged = shiftSession(session, {});
assert.equal(unchanged.deltaMs, 0);
assert.equal(unchanged.startedAt.getTime(), session.startedAt.getTime());
assert.equal(unchanged.endedAt?.getTime(), session.endedAt.getTime());

const shifted = shiftSession(session, { startedAt: new Date("2026-11-05T17:00:00.000Z") });
assert.equal(shifted.deltaMs, 3 * 86_400_000);
assert.equal(shifted.startedAt.toISOString(), "2026-11-05T17:00:00.000Z");
assert.equal(shifted.endedAt?.toISOString(), "2026-11-05T17:54:00.000Z");

const openSession = shiftSession(
  { startedAt: session.startedAt, endedAt: null },
  { startedAt: new Date("2026-11-01T17:00:00.000Z") },
);
assert.equal(openSession.endedAt, null);

assert.ok(parseUpdateWorkoutInput({ startedAt: "2026-11-05T17:00:00.000Z" }).startedAt instanceof Date);
assert.throws(
  () => parseUpdateWorkoutInput({ startedAt: "nope" }),
  (err: any) => err.statusCode === 400,
);

// ---------- analysis ----------

let setSeq = 0;
function aset(workout: string | null, day: number, weightKg: number, reps: number, extra: Partial<AnalysisSet> = {}): AnalysisSet {
  setSeq += 1;
  return {
    id: `s${String(setSeq).padStart(3, "0")}`,
    workoutId: workout,
    routineId: null,
    weightKg: weightKg.toFixed(2),
    reps,
    performedAt: new Date(Date.UTC(2026, 0, day, 10, 0, setSeq)),
    isWarmup: false,
    ...extra,
  };
}

// A single session: a baseline with no records, no plateau, and a target.
{
  const single = analyseExercise({ equipment: "barbell", sets: [aset("w1", 1, 100, 12), aset("w1", 1, 100, 12)] });
  assert.equal(single.records.length, 0);
  assert.equal(single.analysis.sessions, 1);
  assert.equal(single.analysis.plateau, false);
  assert.equal(single.analysis.sessionsSinceBest, 0);
  assert.equal(single.analysis.target?.weightKg, 102.5);
  assert.equal(single.analysis.target?.reps, 8);
  assert.equal(analyseExercise({ equipment: "barbell", sets: [] }).analysis.target, null);
}

// Warm-ups are excluded: from records, from sessions and from the target.
{
  const sets = [
    aset("w1", 1, 100, 5),
    aset("w2", 2, 200, 5, { isWarmup: true }),
    aset("w2", 2, 100, 5),
    aset("w3", 3, 60, 10, { isWarmup: true }),
  ];
  const result = analyseExercise({ equipment: "barbell", sets });
  assert.equal(result.records.length, 0);
  assert.equal(result.analysis.sessions, 2);
  assert.equal(result.analysis.bestValue, Math.round(e1rm(100, 5) * 100) / 100);
}

// Records: strictly better than every earlier session; ties are not records; one per session.
{
  const sets = [
    aset("w1", 1, 100, 5),
    aset("w2", 2, 100, 5), // tie: nothing
    aset("w3", 3, 102.5, 5),
    aset("w3", 3, 105, 5), // the session's best wins both kinds
    aset("w3", 3, 90, 3), // first time at 3 reps: no baseline, no record
    aset("w4", 4, 92.5, 3), // beats the 3-rep best, but not the e1RM
  ];
  const records = personalRecords(groupSessions(sets), "load");
  assert.deepEqual(
    records.map((r) => [r.setId, r.kind, r.reps]),
    [
      [sets[3]!.id, "e1rm", 5],
      [sets[3]!.id, "weight", 5],
      [sets[5]!.id, "weight", 3],
    ],
  );
  // Two identical best sets in a session: the earlier one holds the record.
  const tied = personalRecords(groupSessions([aset("a", 1, 100, 5), aset("b", 2, 110, 5), aset("b", 2, 110, 5)]), "load");
  assert.equal(tied.filter((r) => r.kind === "e1rm").length, 1);
}

// Bodyweight at 0 kg: scored by reps, records are rep records, target is one more rep.
{
  const sets = [aset("w1", 1, 0, 10), aset("w2", 2, 0, 12), aset("w3", 3, 0, 12)];
  const result = analyseExercise({ equipment: "bodyweight", sets });
  assert.equal(result.analysis.mode, "reps");
  assert.equal(result.analysis.bestValue, 12);
  assert.deepEqual(result.records.map((r) => [r.kind, r.value]), [["reps", 12]]);
  assert.equal(result.analysis.target?.weightKg, 0);
  assert.equal(result.analysis.target?.reps, 13);
  // Added weight on a bodyweight exercise switches it to load mode.
  const weighted = analyseExercise({ equipment: "bodyweight", sets: [...sets, aset("w4", 4, 10, 5)] });
  assert.equal(weighted.analysis.mode, "load");
}

// Plateau: PLATEAU_SESSIONS sessions in a row without a new best e1RM.
{
  const flat = [aset("a", 1, 100, 5), aset("b", 2, 100, 5), aset("c", 3, 100, 5), aset("d", 4, 100, 5)];
  assert.equal(plateauStatus(groupSessions(flat), "load").plateau, false);
  assert.equal(plateauStatus(groupSessions(flat), "load").sessionsSinceBest, 3);
  const five = [...flat, aset("e", 5, 97.5, 5)];
  assert.equal(plateauStatus(groupSessions(five), "load").plateau, true);
  const broken = [...five, aset("f", 6, 100, 6)];
  assert.equal(plateauStatus(groupSessions(broken), "load").plateau, false);
  assert.equal(plateauStatus(groupSessions(broken), "load").sessionsSinceBest, 0);
}

// Double progression and rep-range edges.
{
  assert.deepEqual(repRangeFor(null), [8, 12]);
  assert.deepEqual(repRangeFor(10), [7, 10]);
  assert.deepEqual(repRangeFor(2), [1, 2]);
  const at = (...reps: number[]) => groupSessions(reps.map((r) => aset("x", 1, 60, r)))[0]!;
  // Exactly at the top on every set: add weight, back to the bottom.
  assert.deepEqual(
    [nextTarget(at(8, 8, 8), "load", "barbell", [5, 8]).weightKg, nextTarget(at(8, 8, 8), "load", "barbell", [5, 8]).reps],
    [62.5, 5],
  );
  // One set short: same weight, one more rep than the weakest set.
  const short = nextTarget(at(8, 8, 6), "load", "barbell", [5, 8]);
  assert.deepEqual([short.weightKg, short.reps], [60, 7]);
  // Below the bottom of the range still aims for +1; never above the top.
  assert.equal(nextTarget(at(3), "load", "barbell", [5, 8]).reps, 4);
  assert.equal(nextTarget(at(7), "load", "barbell", [5, 8]).reps, 8);
  // Increment per equipment type.
  assert.equal(nextTarget(at(8), "load", "machine", [5, 8]).weightKg, 65);
  assert.equal(nextTarget(at(8), "load", "dumbbell", [5, 8]).weightKg, 62);
  assert.equal(weightIncrement("unknown"), 2.5);
  // Lighter back-off sets don't hold progression back.
  const backoff = groupSessions([aset("y", 1, 100, 8), aset("y", 1, 100, 8), aset("y", 1, 80, 6)])[0]!;
  assert.equal(nextTarget(backoff, "load", "barbell", [5, 8]).weightKg, 102.5);
  // The routine's rep target sets the range when the last session came from a routine.
  const routineSets = [aset("r1", 1, 50, 10, { routineId: "R" })];
  const fromRoutine = analyseExercise({ equipment: "cable", sets: routineSets, routineTargetReps: new Map([["R", 10]]) });
  assert.deepEqual(fromRoutine.analysis.target?.repRange, [7, 10]);
  assert.equal(fromRoutine.analysis.target?.weightKg, 52.5);
}

// Sets outside a workout group by time gaps, not by calendar day.
{
  const loose = groupSessions([
    aset(null, 1, 100, 5, { performedAt: new Date("2026-01-01T23:00:00Z") }),
    aset(null, 1, 100, 5, { performedAt: new Date("2026-01-02T00:30:00Z") }),
    aset(null, 1, 100, 5, { performedAt: new Date("2026-01-02T09:00:00Z") }),
  ]);
  assert.deepEqual(loose.map((s) => s.sets.length), [2, 1]);
}

// Same input in a different order gives the same result.
{
  const sets = [aset("a", 1, 100, 5), aset("b", 2, 105, 5), aset("c", 3, 110, 3), aset(null, 4, 0, 1)];
  const forward = analyseExercise({ equipment: "barbell", sets });
  const backward = analyseExercise({ equipment: "barbell", sets: [...sets].reverse() });
  assert.deepEqual(forward, backward);
}

console.log("checks passed");
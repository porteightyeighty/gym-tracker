import assert from "node:assert/strict";
import { parseRoutineInput } from "../server/utils/routineInput.ts";
import { parseSetInput } from "../server/utils/setInput.ts";
import {
  parseStartWorkoutInput,
  parseUpdateWorkoutInput,
} from "../server/utils/workoutInput.ts";
import { dayStats, e1rm } from "../shared/progress.ts";
import { formatTarget, summariseSession } from "../shared/routines.ts";
import { dayKeyInZone, streak } from "../shared/stats.ts";

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

console.log("checks passed");

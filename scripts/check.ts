import assert from "node:assert/strict";
import { parseSetInput } from "../server/utils/setInput.ts";
import { dayStats, e1rm } from "../shared/progress.ts";

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
]) {
  assert.throws(
    () => parseSetInput(bad),
    (err: any) => err.statusCode === 400,
  );
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

console.log("checks passed");

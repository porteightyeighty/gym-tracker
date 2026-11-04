# Gym tracker — future features

Deferred work only. The current pass covers: edit a set, searchable/grouped exercise picker,
last-time prefill, per-exercise history page, and real pagination.

Suggested order: 6 → 7 → 8. Items 9, 10 and 11 are independent and can slot in anywhere.

---

## 6. Workout sessions

**Value:** answer "what did I do on Tuesday" as one workout rather than a loose list of sets;
track duration and notes; gives templates and the dashboard something to group by.

**Schema** (`server/utils/schema.ts`):

```ts
export const workouts = pgTable("workouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Add to `sets`: `workoutId: uuid("workout_id").references(() => workouts.id, { onDelete: "set null" })`.
Nullable and unbackfilled — existing sets stay grouped by day exactly as today.

**Migration:** edit schema → `npm run db:generate` → `npm run db:migrate` → commit the SQL.

**API:**

- `GET /api/workouts/active` — the latest workout with `endedAt` null, or null.
- `POST /api/workouts` — start, `startedAt` defaults to now.
- `PATCH /api/workouts/:id` — finish (`endedAt`) and/or notes.
- `GET /api/workouts?limit=&offset=` — history, newest first.
- `POST /api/sets` and `PATCH /api/sets/:id` accept an optional `workoutId`; validate that the
  workout exists and is not finished.
- `GET /api/sets` returns `workoutId` so the UI can group.

**UI:** a "Start workout" / "Finish workout (42 min)" button in the header. While a workout is
active, new sets attach automatically. Recent sets group by workout when `workoutId` is present,
falling back to the day grouping otherwise.

**Edge cases:** sets already logged before starting a workout stay unattached; editing a set's
`performedAt` outside the workout window is allowed (don't enforce); finishing is idempotent.

**Effort:** 1 migration, 4 endpoints, header + grouping changes.

---

## 7. Templates / routines

**Value:** repeated programming without re-picking exercises every session.

**Schema:**

```ts
export const routines = pgTable("routines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    targetSets: integer("target_sets"),
    targetReps: integer("target_reps"),
    targetWeightKg: numeric("target_weight_kg", { precision: 6, scale: 2 }),
  },
  (t) => [index("routine_exercises_routine_idx").on(t.routineId, t.position)],
);
```

**API:** CRUD for routines and their exercise list; `POST /api/routines/:id/start` creates a
workout and returns the ordered exercise list so the client can prefill the picker.

**UI:** `/routines` page (list, create, edit order/targets), "Start" button. During a workout,
show the template's exercises in order with the next one selected.

**Depends on:** 6. Do not build this before sessions exist.

**Effort:** 1 migration, 5–6 endpoints, one page.

---

## 8. Stats dashboard

**Value:** weekly volume, sets per equipment type, and a streak — no schema change.

**API:** `GET /api/stats?from=&to=` returns:

- weekly volume: `sum(weight_kg * reps)` grouped by ISO week
- sets per equipment type
- total sets, sessions (days or workouts), current streak
- per-exercise top-set trend for the selected range (or reuse the exercise page)

Implement with `date_trunc('week', performed_at)` and `sum()` in one query; do not fetch all sets
and aggregate in JS.

**UI:** `/stats` page, same SVG chart approach as the exercise page. Exclude warmup sets once
item 9 exists. Bodyweight exercises contribute 0 volume unless a body weight is recorded.

**Effort:** 1 endpoint, 1 page. Cheapest "full-featured" win after sessions.

---

## 9. Set metadata: notes, RPE/RIR, warmup flag

**Value:** context the numbers alone lose.

**Schema:** add to `sets`:

```ts
notes: text("notes"),
rpe: numeric("rpe", { precision: 3, scale: 1 }),   // 1–10
isWarmup: boolean("is_warmup").notNull().default(false),
```

**API:** extend the shared set validator (1–10 for RPE, trim/length-cap notes, boolean for warmup).
Expose the fields in `GET /api/sets` and the exercise history.

**UI:** optional fields in the form and inline display; exclude warmups from PRs, best e1RM and
volume in stats.

**Effort:** 1 migration, validation + form changes.

---

## 10. Body weight log

**Value:** one number that motivates, plus it makes bodyweight-exercise volume meaningful.

**Schema:**

```ts
export const bodyWeights = pgTable(
  "body_weights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }).notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("body_weights_measured_at_idx").on(t.measuredAt)],
);
```

**API:** `POST /api/body-weights`, `GET /api/body-weights?limit=`, optionally delete.
**UI:** a small card on the dashboard or a section on the home page; trend line.
**Effort:** 1 migration, 2 endpoints, one form + chart.

---

## 11. CSV export

**Value:** backup and data portability; also the escape hatch if you ever leave this app.

**API:** `GET /api/export.csv` — sets joined with exercises, ISO timestamps, proper CSV escaping
(quote fields containing `,`/`"`/newline, double embedded quotes). Include a `text/csv` content type
and `Content-Disposition: attachment`.

**UI:** one download link. No state.
**Effort:** 1 endpoint, ~30 lines, no migration.

---

## Deliberately skipped (revisit only on request)

| Idea | Why not now |
|------|-------------|
| kg/lb toggle | Everything is stored and displayed in kg; adding units means a display layer everywhere and a stored unit per user. |
| Rest timer | Belongs on your phone; a tab that must stay open is worse than the one you already use. |
| Plate calculator | Niche, and a one-off lookup solves it. |
| PWA / offline | No requirement yet; the app is single-user and online. |
| Multi-user (`user_id`) | Deliberate single-user design. Adding it means a migration plus backfill on `exercises` and `sets`, and every query gains a filter. |
| Social / sharing / leaderboards | Not the point of a personal log. |
| Program periodization / RPE autoregulation | Real feature, but needs set metadata (9) and a much larger UX investment. |
| Photo progress | Storage, privacy and moderation cost for marginal value. |
| Apple Health / wearable import | External API work; CSV export (11) covers the manual case. |

---

## Cross-cutting notes

- **Backups:** confirm Railway Postgres backups, or schedule `pg_dump`. Everything above is
  recoverable except the data itself.
- **Pagination:** every new list endpoint (workouts, body weight) gets the same `limit`/`offset` +
  `hasMore` contract as `/api/sets`; don't invent a second style.
- **Timezones:** keep storing `timestamptz` UTC and rendering local. Day/week grouping must use the
  browser's local date, not UTC, or sets near midnight land on the wrong day.
- **Auth:** every new endpoint keeps the `await requireSession(event)` first line.
- **Checks:** the repo has no test runner. Pure helpers (validation, day/week aggregation, CSV
  escaping) get an assert-based `scripts/check.ts` run by `npm run check`; route handlers stay thin.

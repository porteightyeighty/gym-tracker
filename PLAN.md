# Plan: workout analysis worker

Goal: a second service that consumes "a workout finished or changed" events and derives personal
records, plateaus and next-session targets, shown back in the app. The point is a justified
async design (outbox, idempotent consumer, retries, rebuildable derived data) with tests that
prove it, not a second service for its own sake.

Do this before finishing the README rewrite (branch `readme-rewrite`); its Decisions section
will gain the outbox and worker.

## Why async, in one paragraph (for the README later)

Analyses depend on the whole history of an exercise, not just the workout being saved, and
editing or deleting a past session changes them. Computing them in the request would make every
write slower and couple it to analysis rules that will change. Instead the write records an event
in the same transaction, a worker recomputes from current data, and the analyses table can be
rebuilt at any time from history. Postgres is the queue: one user, one database already there,
and `FOR UPDATE SKIP LOCKED` is enough. No Kafka/RabbitMQ.

## Design

**Events (outbox).** New table `outbox`:
`id uuid pk, kind text, payload jsonb, created_at, available_at, attempts int default 0,
last_error text, processed_at timestamptz null`. Index on `(processed_at, available_at)`.

- `workout_finished { workoutId }`: written in the existing transaction in
  `server/api/workouts/[id].patch.ts`, only on the first finish (the route already keeps the first
  `endedAt`) and not when the empty workout is discarded.
- `history_changed { exerciseIds }`: written by any route that changes finished history:
  `sets/[id].patch.ts`, `sets/[id].delete.ts`, `sets.post.ts` when the set belongs to an
  already-finished workout, `workouts/[id].patch.ts` when shifting a finished session's time, and
  `workouts/[id].delete.ts`. Each in the same transaction as the change.

**Consumer is a function of current data, not of the event.** The worker never applies a delta.
For each affected exercise it recomputes that exercise's analyses from all its sets and replaces
the stored rows in one transaction. So a duplicate or out-of-order event is harmless, which is
what makes at-least-once delivery safe. Write that down explicitly in the README.

**Claiming.** Loop: in a transaction, `SELECT … FROM outbox WHERE processed_at IS NULL AND
available_at <= now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`, handle, set
`processed_at`. On error: `attempts + 1`, `last_error`, `available_at = now() + backoff`
(e.g. 2^attempts seconds, capped). After 5 attempts leave it unprocessed with `attempts = 5` as
the dead-letter state, and log it. Poll every few seconds; optionally `LISTEN/NOTIFY` to wake
sooner (a nice-to-have, not needed).

**Derived data.** New table `exercise_analyses` (one row per exercise) and `set_flags` or a
`personal_records` table (one row per PR set), whichever reads simpler. Contents:

- Personal records: best estimated 1RM (reuse `e1rm` in `shared/progress.ts`, Epley) and best
  weight at each rep count, flagged on the set that achieved it. Warm-up sets excluded.
- Plateau: no e1RM improvement on the exercise in the last N sessions (start N = 4).
- Next-session target: double progression. If every working set last time hit the top of the
  rep range, add a weight increment (per equipment type, see `shared/equipment.ts`); otherwise
  same weight, aim for +1 rep. Keep the rule simple and documented.

All of this is pure functions in `shared/analysis.ts`, so `npm run check` covers it.

**Rebuild.** `npm run analyses:replay` recomputes every exercise from scratch (truncate and
refill in one transaction). Needed when a rule changes. Also runnable as a one-off on Railway.

**Service layout.** `worker/index.ts`, run with Node type stripping like `scripts/`. Same repo,
second Railway service, same `DATABASE_URL`, start command `node worker/index.ts`, no public
domain. Graceful shutdown on SIGTERM (finish the current batch, then exit). Health: log a
heartbeat; Railway restarts it on crash.

## Steps

- [x] 1. Schema: `outbox` and the analysis tables in `server/utils/schema.ts`, then
      `npm run db:generate` and commit the SQL.
- [x] 2. Outbox writes: a small `enqueue(tx, kind, payload)` helper in `server/utils/`, called
      inside the existing transactions in the routes listed above. Routes that don't use a
      transaction yet get one.
- [x] 3. `shared/analysis.ts`: PRs, plateau and target as pure functions, with assert cases in
      `scripts/check.ts` (ties, warm-ups excluded, bodyweight exercises at 0 kg, a single
      session, rep-range edges).
- [x] 4. Worker: claim loop, recompute per exercise, backoff and dead-letter, SIGTERM handling.
- [x] 5. Replay script.
- [x] 6. UI: "New PR" badge on sets in the finished session and in history; next-session target
      and plateau hint on the exercise when logging and on `exercises/:id`. New read route(s)
      starting with `requireSession`.
- [x] 7. Integration tests against real Postgres (this is also portfolio plan item 3.4): a test
      database in a container, migrations applied, then:
      - finishing a workout writes exactly one event, discarding an empty one writes none
      - a route that throws after the insert leaves no event (same transaction)
      - processing the same event twice gives the same analyses
      - a crash between claim and `processed_at` (kill mid-batch) is retried and ends correct
      - editing an old set changes PRs after processing
      - replay from scratch equals incremental processing
- [x] 8. CI: GitHub Actions with a Postgres service container running `npm run check`,
      `npm run typecheck` and the integration tests.
- [ ] 9. Tracing (stretch): OpenTelemetry on the web request and the worker, with the trace
      context stored in the outbox row so one trace spans request → event → analysis. Railway
      supports OTLP.
- [x] 10. Deploy the worker service on Railway, run replay once, then update the README
      (Decisions: outbox, consumer is a function of current data, Postgres as queue; Running:
      worker and replay commands) and AGENTS.md.

## Decisions taken while implementing

- Rep range: the routine's `target_reps` is the top of the range and three below it the bottom
  when the last session came from a routine; otherwise 8–12. Routine edits and deletes write
  `history_changed`, since they change that input. Suggestions are only shown, never written back.
- PR badges are worker-only, as suggested below.
- PRs are historical ("beat every earlier session at the time"), not just the current all-time
  best, so old sessions in history keep their badges. First session = baseline, no badges.
- Bodyweight at 0 kg is scored by reps (rep records, +1 rep target) so it doesn't plateau at 0.
- Only finished sessions (and sets outside any workout) feed analyses; workout-less sets group
  into sessions by a 3-hour gap rather than by a timezone-dependent day.
- Step 7 tests drive the built server over HTTP; the crash test SIGKILLs a real child worker.
- Remaining: 9 (tracing, stretch).

## Step 10: move to a dedicated `gym` Railway project

The gym services were in the shared `mattport.com` project next to unrelated apps (edge, r2l,
cv). Railway IaC is project-scoped, so they moved to their own project, `gym`
(f5e4b749-8831-455b-bdb6-5fbbd6d0e243), described by `.railway/railway.ts`. Railway can't move a
service between projects, so it was a rebuild; the data was re-imported from a CSV export rather
than restored from a dump.

- [x] Create the `gym` project; apply GymDB and its volume (pinned to europe-west4: on create
      Railway ignored the database's region and put the volume in sfo).
- [x] Apply `web` and `worker`; set `BETTER_AUTH_SECRET` (fresh), `SEED_EMAIL`, `SEED_PASSWORD`.
- [x] Import the workout history (4 workouts, 70 sets) with one `history_changed` event, then
      `npm run analyses:replay` after the 8–12 default rep range change.
- [x] Cut over `gym.mattport.com` to the new `web` (domain now declared in the file).
- [x] Delete the old gym-tracker, GymDB and its volume
      from `mattport.com`.

## Open questions

- Rep ranges for the target: `routine_exercises` already stores `target_sets`, `target_reps` and
  `target_weight_kg`. Use those when the workout came from a routine, else a global default
  (e.g. 5–8)? And should the worker write its suggestion back into the routine, or only show it?
- Should a PR badge appear immediately when a set is logged (a cheap check in the request) or
  only after the worker runs? Starting with worker-only is simpler and honest about the design.
- Backups for the Railway Postgres are still unconfirmed. Check before adding more derived data
  (it's rebuildable, but the sets aren't).

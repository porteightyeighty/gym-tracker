# Gym tracker

A workout log I use myself, live at [gym.mattport.com](https://gym.mattport.com). It records sets,
sessions, routines and body weight, and shows progress per exercise and week by week.

I built it to keep my training data under my own control instead of on a paid service that
makes use of my health data.

Nuxt 4 (Vue 3) and Nitro, Postgres with Drizzle, Better Auth. Deployed on Railway as the web app
plus a small analysis worker, sharing one database.

## What it does

- **Sessions.** Start a workout, log sets in a full-screen view built for a phone between sets,
  with a rest timer. Empty workouts are discarded when you finish.
- **Routines.** Saved exercise lists, with "copy from last session" to repeat the previous
  weights and reps.
- **Set details.** Notes and RPE on any set.
- **Cardio.** Cardio machines log a duration and optional distance instead of weight × reps.
- **Stats.** Weekly volume, training streak and per-exercise top-set history.
- **Analysis.** Personal-record badges on sets, a plateau hint, and a next-session target per
  exercise (double progression), computed by a background worker.
- **History.** Edit or delete past sessions.
- **Body weight log and CSV export** of everything.

<!-- TODO(3.2): screenshots or a short clip here. -->

## Decisions

**Single-user, on purpose.** There is no `user_id` on any data table and signup is disabled; the
seed script is the only way to create an account. That keeps every query free of a tenant filter.
The cost is known: going multi-user means a migration, a backfill on `exercises`, `sets` and
`body_weights`, and a filter added to every query.

**Store UTC, group in the user's timezone.** Timestamps are `timestamptz` in UTC. Grouping by UTC
date put late-evening sets on the wrong day, so the client sends its timezone and `/api/stats`
groups with `AT TIME ZONE` in SQL. Day keys on the client use the same rule.

**Thin routes, tested helpers.** Validation lives in `server/utils/*Input.ts` and aggregation
(streaks, weekly volume, CSV escaping, progress, analysis rules) in `shared/`. `npm run check`
runs assertions over those pure functions under plain Node, with no test runner. Integration tests
(`npm run test:integration`) run the built server and the worker against a real Postgres.

**Analyses are computed asynchronously, from an outbox.** Analyses depend on the whole history of
an exercise, not just the workout being saved, and editing or deleting a past session changes
them. Computing them in the request would make every write slower and couple it to rules that
will change. Instead, any route that changes finished history writes an event row to `outbox` in
the same transaction as the change, so the event exists if and only if the change committed. The
worker (`worker/`) picks events up within a couple of seconds and recomputes.

**The consumer is a function of current data, not of the event.** An event only names the
exercises to look at (`workout_finished { workoutId }`, `history_changed { exerciseIds }`). The
worker never applies a delta: it recomputes each exercise's records, plateau and target from all
its finished sets and replaces the stored rows in one transaction. A duplicate, late or
out-of-order event is therefore harmless, which is what makes at-least-once delivery safe. It also
means `exercise_analyses` and `personal_records` are disposable: `npm run analyses:replay`
truncates and rebuilds them, which is how a rule change is rolled out. The integration tests check
both properties (re-delivering every event changes nothing; replay equals incremental).

**Postgres is the queue.** One user and a database that's already there: the worker claims up to
10 events with `FOR UPDATE SKIP LOCKED` and handles each in its own savepoint inside the claiming
transaction. A crash before commit rolls the batch back and releases the locks, so the events are
claimed again (tested by killing a worker mid-batch). A failing event is retried with backoff
(2, 4, 8, … s) and after 5 attempts stays unprocessed as a dead letter, logged and counted in the
worker's heartbeat. No Kafka or RabbitMQ; `LISTEN/NOTIFY` would wake it sooner but polling is enough.

**Analysis rules** (`shared/analysis.ts`). Only finished sessions count.
- *Personal record:* a session's best set that strictly beats every earlier session, for estimated
  1RM (Epley) and for weight at an exact rep count. The first session is the baseline; ties and
  first-ever rep counts aren't records. At 0 kg (bodyweight) the record is most reps.
- *Plateau:* four sessions in a row without a new best e1RM (or rep count at 0 kg).
- *Next-session target:* double progression from the last session. If every set at its top weight
  reached the top of the rep range, add one increment (barbell/cable 2.5 kg, dumbbell 2 kg, machine
  5 kg) and drop to the bottom of the range; otherwise keep the weight and aim for one more rep.
  The range is the routine's target reps and three below, or 8–12 outside a routine. Suggestions are
  only shown, never written back into routines.

**Cardio is a set with a duration.** A cardio exercise (type `cardio`) logs `duration_seconds` and
an optional `distance_km` on an ordinary `sets` row, with reps and weight stored as 0, so it sits in
workouts, history and export with no new tables or routes. The set routes check the entry's shape
against the exercise type. Cardio counts as a training day but not towards sets or volume, and the
worker gives it no PRs or targets.

**Every data route starts with `requireSession`.** One guard, applied first, so an endpoint can't
be added without auth by accident. Malformed input is a 400, never a 500. List endpoints clamp
`limit`/`offset` on the server and return `{ items, hasMore }`.

**Session check once per load, not per request.** Better Auth's signed cookie cache (5 minutes)
skips the session lookup on most API calls, and the client checks the session once per app load
rather than on every navigation. Page fetches and the stats queries run in parallel.

**Migrations that fail loudly.** Migrations are generated by drizzle-kit and committed, but run
through drizzle-orm's migrator in Railway's pre-deploy step, so a failed migration stops the
deploy with a visible error.

**A familiar stack.** I chose Nuxt because I already knew Vue, and Drizzle because it is a
straightforward way to get from TypeScript to Postgres: the schema is code, and queries read close
to the SQL they produce.

### Left out deliberately

| Idea | Why not |
|------|---------|
| Multi-user | See above; not needed for a personal log. |
| kg/lb toggle | Needs a display layer everywhere and a stored unit per user. |
| Offline / PWA | The app is used online; no requirement yet. |
| Wearable import | External API work. CSV export covers the manual case. |
| Periodisation / RPE autoregulation | Real feature, but a much larger UX job than the RPE field. |

### Known gaps

- No password reset. Re-running the seed with a new password is the recovery path.
- Bodyweight exercises count as zero volume. Weigh-ins are logged but not applied per set.
- Per-exercise history is capped at 1,000 sets and the streak at 366 training days, each to keep
  the query to one round trip.
- PR badges and targets appear once the worker has run (seconds), not the moment a set is logged.
  If the worker is down, logging still works and analyses catch up when it restarts.
- The default 8–12 rep range suits machine and accessory work; outside a routine it gives high-rep
  targets for heavy compound lifts.

## Running it

Needs Node 24+ and a Postgres database.

```sh
npm install
cp .env.example .env    # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm run db:migrate
SEED_EMAIL=you@example.com SEED_PASSWORD=at-least-8-chars npm run seed
npm run dev
```

The seed is idempotent; re-run it with a different password to reset the login.

| Command | |
|---------|---|
| `npm run check` | assertions over the pure helpers |
| `npm run typecheck` | `nuxt typecheck` (an upstream `vue-router/volar` plugin warning is expected) |
| `npm run build && npm start` | the production server Railway runs |
| `npm run db:generate` | generate a migration after editing `server/utils/schema.ts` |
| `npm run worker` | the analysis worker (run it alongside `npm run dev` to see PRs and targets) |
| `npm run analyses:replay` | rebuild all analyses from history, e.g. after changing a rule |
| `TEST_DATABASE_URL=… npm run test:integration` | build, then integration tests against a database whose name contains `test` (it is wiped) |

## Deploying (Railway)

Two services from this repo plus the Postgres plugin, which provides `DATABASE_URL`. Keep all three
in the same region.

- Variables: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (the public
  https URL, no trailing slash; a mismatch shows up as a login that bounces straight back), and
  `SEED_EMAIL` / `SEED_PASSWORD`.
- Pre-deploy command: `npm run db:migrate && npm run seed`.
- Healthcheck path: `/login`.

The worker is a second service from the same repo: start command `node worker/index.ts`, the same
`DATABASE_URL`, no public domain and no healthcheck path. It logs a JSON heartbeat every minute
(pending and dead-letter counts); Railway restarts it on a crash, and SIGTERM on redeploy lets it
finish its current batch. After the first deploy, or after changing a rule, run
`npm run analyses:replay` once against the production database.

## Layout

```
app/pages/          index (log), history, routines, stats, exercises/:id, login
server/api/         sets, workouts, routines, exercises, stats, body-weights, export.csv
server/utils/       schema, db client, auth, requireSession, *Input.ts validation, outbox
shared/             pure helpers shared by app, server and scripts, incl. analysis rules
worker/             outbox consumer (process.ts) and its poll loop (index.ts)
scripts/            migrate, seed, check, replay
tests/              integration tests against real Postgres
drizzle/            generated SQL migrations
```

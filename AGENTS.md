# gym-tracker

Nuxt 4 + Postgres + Drizzle, deliberately single-user. Two Railway services from this repo: the web app and the analysis worker (`worker/`), sharing one database. Setup, deploy, design decisions (outbox, worker, analysis rules), deliberately skipped work and known gaps are in `README.md`; remaining planned work is in `PLAN.md`.

## Commands

- `npm run check` — assert-based checks for pure helpers in `scripts/check.ts`; no test runner, linter or formatter.
- `TEST_DATABASE_URL=... npm run test:integration` — builds, then `tests/integration.ts` (`node:test`) runs the built server and worker against Postgres. It wipes that database and refuses one whose name lacks `test`. Locally: a `gym_test` database in the dev Postgres container.
- `npm run typecheck` — `nuxt typecheck`, then `tsc -p tsconfig.scripts.json` for `worker/`, `scripts/` and `tests/` (Nuxt doesn't cover those). Nuxt prints `Load plugin failed: vue-router/volar/sfc-route-blocks` but exits 0; that warning is an upstream version mismatch, not a failure.
- `npm run worker` — the outbox consumer; run alongside `npm run dev` to see PRs/targets. `npm run analyses:replay` rebuilds all derived analysis rows.
- `npm run build && npm start` — what Railway runs (`node .output/server/index.mjs`). Verify UI changes here, not only in `npm run dev`.
- `npm run db:generate` after editing `server/utils/schema.ts`, then `npm run db:migrate`. Commit the generated SQL in `drizzle/`; never hand-write migrations.
- `SEED_EMAIL=... SEED_PASSWORD=... npm run seed` — idempotent; re-run with a new password to reset a login. Signup is disabled, so this is the only way to create a user.
- CI (`.github/workflows/ci.yml`) runs check, typecheck and integration tests on push to `main`; run `npm run check` and `npm run typecheck` locally before pushing anyway.
- Node 24+ required. Scripts run `.ts` files directly via Node type stripping, so relative imports need explicit `.ts` extensions and cannot use Nuxt aliases.

## Wiring

- `server/utils/*` is auto-imported in routes: `db`, schema tables (`sets`, `exercises`, `workouts`, …), `requireSession`, `parse*Input`, `rethrowSetError`, `findActiveWorkout`, routine helpers. H3 helpers (`defineEventHandler`, `createError`, `getQuery`, `readBody`) are auto-imported too.
- Exception: `server/utils/*Input.ts` is also imported by `scripts/check.ts` under plain Node, so those files explicitly `import { createError } from "h3"` and use `./x.ts` relative imports. Keep that shape; don't switch them to auto-imports or `~~/`.
- `shared/` holds pure isomorphic helpers used by app, server and scripts. Keep route handlers thin: validation goes in `*Input.ts`, aggregation/formatting in `shared/`, so `npm run check` can cover it.
- Every data route starts with `await requireSession(event)`. List endpoints clamp `limit`/`offset` server-side and return `{ items, hasMore }`.
- No `user_id` on data tables: everything is global to the single user. Multi-user would need a migration, a backfill and a filter on every query.
- Outbox rule: any route that changes finished history (sets in a finished workout or in no workout, a finished workout's time, deletions, routine target reps) must call `enqueue`/`enqueueHistoryChanged` (`server/utils/outbox.ts`) with the same `tx` as the change. Sets in an open workout are not history and write no event; finishing it writes `workout_finished`.
- `exercise_analyses` and `personal_records` are derived: only `worker/process.ts` writes them, always by recomputing an exercise from all its sets. Never update them from a route. Rules live in `shared/analysis.ts`; after changing one, run the replay.
- `worker/`, `scripts/` and `tests/` run under plain Node: relative `.ts` imports, no auto-imports, import schema from `../server/utils/schema.ts`.
- Timestamps are `timestamptz` stored in UTC. Day/week grouping uses the browser timezone (`tz` query on `/api/stats`, `localDayKey`, `dayKeyInZone`) — never group by UTC dates.
- Railway: `.railway/railway.ts` is the `gym` project as code (IaC, `railway config plan|apply`). Applying deletes anything removed from the file; always plan first. Never point this file at the shared `mattport.com` project.
- Env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (see `.env.example`). Nuxt loads `.env` itself; scripts use `node --env-file-if-exists=.env`.

## Git conventions

- Conventional commits, lowercase, imperative, no scope: `feat:`, `fix:`, `docs:`, `chore:`.
- Short subject line, no trailing period. Body only when the why is not obvious.
- Commit straight to `main`; no feature branches for small changes.

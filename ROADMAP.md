# Gym tracker — future features

The planned pass is complete: workout sessions, routines (including "copy from last session"),
set metadata (notes, RPE, warmup), the stats dashboard, CSV export and the body weight log.
This file keeps the conventions those features established and the work deliberately left out.

## Conventions for new endpoints

- `await requireSession(event)` is the first line of every data route.
- List endpoints take `limit`/`offset` clamped server-side and return `{ items, hasMore }`
  (see `/api/sets` and `/api/body-weights`).
- Validation lives in `server/utils/*Input.ts`; malformed input throws a 400, never a 500.
- Timestamps are `timestamptz` stored in UTC. Day and week grouping use the browser's timezone:
  the client sends `tz` to `/api/stats`, which applies `AT TIME ZONE` in SQL.
- Schema changes are `npm run db:generate` then `npm run db:migrate`; commit the SQL.
- Pure helpers get assert cases in `scripts/check.ts` (`npm run check`); routes stay thin.

## Deferred ideas

| Idea | Why not now |
|------|-------------|
| Workout history page | `GET /api/workouts` exists; the home page groups recent sets by workout, which covers the daily use. |
| Bodyweight exercise volume | Needs a per-set lookup of the nearest weigh-in; bodyweight sets currently count 0 volume. |
| Streak beyond 366 days | The stats query caps the day list at 366 for a single round trip. |
| Drag-and-drop routine ordering | Up/down buttons are enough for a personal list. |
| Per-exercise trends on `/stats` | The exercise page already charts top-set history. |

## Deliberately skipped (revisit only on request)

| Idea | Why not now |
|------|-------------|
| kg/lb toggle | Everything is stored and displayed in kg; adding units means a display layer everywhere and a stored unit per user. |
| Rest timer | Belongs on your phone; a tab that must stay open is worse than the one you already use. |
| Plate calculator | Niche, and a one-off lookup solves it. |
| PWA / offline | No requirement yet; the app is single-user and online. |
| Multi-user (`user_id`) | Deliberate single-user design. Adding it means a migration plus backfill on `exercises`, `sets` and `body_weights`, and every query gains a filter. |
| Social / sharing / leaderboards | Not the point of a personal log. |
| Program periodization / RPE autoregulation | Real feature, but needs a much larger UX investment on top of the existing RPE metadata. |
| Photo progress | Storage, privacy and moderation cost for marginal value. |
| Apple Health / wearable import | External API work; CSV export covers the manual case. |

## Cross-cutting notes

- **Backups:** confirm Railway Postgres backups, or schedule `pg_dump`. Everything above is
  recoverable except the data itself.
- **Timezones:** keep storing `timestamptz` UTC and rendering local. Day/week grouping must use
  the browser's local date (`localDayKey`, `dayKeyInZone`), not UTC, or late-evening sets land on
  the wrong day.
- **Auth:** every new endpoint keeps `await requireSession(event)` first. The app is still
  single-user with no `user_id`.
- **Checks:** the repo has no test runner. Pure helpers (validation, day/week aggregation, CSV
  escaping, streaks) get an assert-based `scripts/check.ts` run by `npm run check`; route
  handlers stay thin.

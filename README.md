# Gym tracker

Nuxt + Postgres on Railway. Logs sets, workout sessions, routines, stats and body weight.

## Local

```sh
npm install
cp .env.example .env          
npm run db:migrate
SEED_EMAIL=you@example.com SEED_PASSWORD=yourpassword npm run seed
npm run dev
```

`npm run seed` is idempotent. Re-run it with a different password to reset your login.

## Deploy to Railway

1. New project → **Deploy from repo**.
2. Add the **Postgres** plugin. It injects `DATABASE_URL`.
3. Set service variables:
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — the public domain Railway gives you, e.g. `https://gym-tracker.up.railway.app`
4. Deploy. Railway autodetects `npm run build` / `npm start`. In the service's **Settings → Deploy**, set the pre-deploy command to `npx drizzle-kit migrate` and the healthcheck path to `/login`.
5. Seed your account once:

   ```sh
   railway run npm run seed
   ```

   (with `SEED_EMAIL` / `SEED_PASSWORD` exported, or `SEED_EMAIL=... SEED_PASSWORD=... railway run npm run seed`)

Signup is disabled in the app, so the seed script is the only way to create a user.

## Layout

```
shared/                      isomorphic helpers: equipment, progress, routines, stats, csv
server/utils/schema.ts       drizzle schema (app tables + Better Auth's tables)
server/utils/db.ts           drizzle client
server/utils/auth.ts         Better Auth config
server/utils/requireSession.ts  401 guard used by every data route
server/utils/*Input.ts       request validation shared with scripts/check.ts
server/api/                  sets, workouts, routines, stats, body-weights, export.csv
app/pages/                   index (log + recent sets), login, exercises/:id, routines, stats
app/middleware/auth.global.ts  redirects to /login when signed out
scripts/seed.ts              one user + 26 common lifts
scripts/check.ts             assert-based checks for pure helpers
drizzle/                     generated SQL migrations, committed
```

## Adding async analysis later

The app is a single service today. To add a consumer:

1. `npm i pg-boss`
2. Add `worker/index.ts` that creates the boss, `boss.work("analyse-set", ...)`, and writes results to a new `analyses` table (new drizzle schema + migration).
3. Add a second Railway service from the same repo with start command `node worker/index.ts` (or a compiled entry). It shares `DATABASE_URL`.
4. In `server/api/sets.post.ts`, after the insert: `await boss.send("analyse-set", { setId: row.id })`.

If losing a job on a failed enqueue ever matters, add an outbox table instead of calling `boss.send` inline.

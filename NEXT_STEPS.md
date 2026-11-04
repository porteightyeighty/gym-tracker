# Next steps

## 1. Verify locally

Prereqs: Node 24+, a Postgres to point at (local, podman/docker, or a Railway dev database).

```sh
npm install
cp .env.example .env        # set DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm run db:migrate
SEED_EMAIL=you@example.com SEED_PASSWORD=at-least-8-chars npm run seed
npm run dev
```

Checklist:

- [ ] `http://localhost:3000` redirects to `/login` when signed out.
- [ ] Log in with the seeded credentials.
- [ ] Add a set: pick exercise, weight, reps → appears under "Today".
- [ ] Add an exercise inline (`+ New exercise`) → it shows up in the picker and is preselected.
- [ ] Delete a set with `✕` → disappears.
- [ ] Reload → data is still there.
- [ ] `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/sets` → `401`.
- [ ] `npm run typecheck` exits 0 (ignore the `vue-router/volar/sfc-route-blocks` warning).
- [ ] `npm run build && npm start` → same behaviour as dev (this is what Railway runs).
- [ ] Re-run `npm run seed` with a new password → old password stops working, new one logs in.

Optional: break something on purpose (e.g. POST a set with `reps: 0`) and confirm a 400 rather than a 500.

## 2. Deploy to Railway

- [ ] `git init && git add -A && git commit -m "initial"`, push to GitHub.
- [ ] Railway → New Project → Deploy from GitHub repo.
- [ ] Add the **Postgres** plugin to the project.
- [ ] In the app service → Variables, set:
  - `BETTER_AUTH_SECRET` = `openssl rand -base64 32`
  - `BETTER_AUTH_URL` = the public domain, e.g. `https://gym-tracker-production.up.railway.app`
  - `DATABASE_URL` should already be there from the plugin (reference `${{Postgres.DATABASE_URL}}` if not).
- [ ] In the service → Settings, set pre-deploy command `npx drizzle-kit migrate` and healthcheck path `/login` (Railway autodetects the build and start commands).
- [ ] Deploy.
- [ ] Generate the domain: Settings → Networking → Generate Domain, and make sure it matches `BETTER_AUTH_URL` exactly (https, no trailing slash).
- [ ] Seed your account once:

  ```sh
  SEED_EMAIL=you@example.com SEED_PASSWORD=at-least-8-chars railway run npm run seed
  ```

## 3. Post-deploy checks

- [ ] `/login` returns 200 (this is the healthcheck path).
- [ ] Log in over https — if the login succeeds but you're immediately bounced back to `/login`, the cookie is being rejected: `BETTER_AUTH_URL` is wrong or doesn't match the domain.
- [ ] Add a set, reload, confirm it persisted.
- [ ] Redeploy (push a trivial commit) and confirm the data is still there and the migration step is a no-op.
- [ ] Check the deploy logs for `migrations applied successfully`.
- [ ] Check Railway's Postgres → Backups. If your plan has none, add a scheduled `pg_dump` or accept the risk knowingly.

## 4. Known gaps

- **No password reset.** Signup is disabled; re-running `railway run npm run seed` with a new `SEED_PASSWORD` is the recovery path.
- **No `user_id` anywhere.** Deliberate, single user. Adding multi-user later means a migration plus a backfill on `exercises` and `sets`.
- **Times are stored in UTC**, entered and shown in the browser's local timezone. Travel across timezones will show sets at their original wall-clock-equivalent UTC instant.
- **Per-exercise history is capped at 1000 sets.** Paginate if any single lift ever exceeds it.
- **Login rate limiting** is Better Auth's built-in default; nothing custom is configured.
- **`nuxt typecheck` warning** about `vue-router/volar/sfc-route-blocks` is an upstream version mismatch, not your code. Remove when vue-router ships that export path.

## 5. Next features, roughly in order of value

The full roadmap is in `ROADMAP.md`. Short version:

1. Workout/session grouping (`workouts` table + `sets.workout_id`).
2. Templates/routines built on sessions.
3. Stats dashboard (weekly volume, equipment split, streak).
4. Set metadata (notes, RPE, warmup), body weight log, CSV export.

## 6. Adding the analysis worker

The app is one service now. To add a consumer without touching the frontend:

1. `npm i pg-boss`.
2. Add `analyses` to `server/utils/schema.ts` (`id`, `set_id`, `kind`, `result jsonb`, `created_at`), then `npm run db:generate && npm run db:migrate`.
3. Create `worker/index.ts`: connect with `DATABASE_URL`, `boss.work("analyse-set", async ([job]) => …)` writing to `analyses`. pg-boss manages its own schema.
4. Add a second Railway service from the same repo, same variables, start command `node worker/index.ts`.
5. In `server/api/sets.post.ts`, after the insert: `await boss.send("analyse-set", { setId: row.id })`.

Known gap: if the enqueue throws after the insert commits, that job is lost. Only worth fixing (outbox table) if analyses become something you rely on.

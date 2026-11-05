/**
 * The gym project on Railway: Postgres, the web app and the analysis worker, all in one region
 * (a region mismatch between app and database once caused large latency).
 *
 *   railway config plan     # read-only preview
 *   railway config apply    # asks for confirmation; removing a resource here DELETES it
 *
 * Secrets are `preserve()`: their values live only in Railway. Set them with
 * `railway variables --service web --set KEY=value`.
 */
import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

const REGION = "europe-west4-drams3a";
const REPO = github("porteightyeighty/gym-tracker", { branch: "main", checkSuites: false });

export default defineRailway(() => {
  const db = postgres("GymDB", { region: REGION });
  // Declared explicitly: on create, Railway puts the database's auto-made volume in the workspace
  // default region (sfo) and ignores the database's region. The volume is where the data lives.
  const dbVolume = volume("gymdb-volume", { region: REGION, sizeMB: 5000, allowOnlineResize: true });

  const web = service("web", {
    source: REPO,
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    healthcheck: "/login",
    domains: ["gym.mattport.com"],
    preDeploy: "npm run db:migrate && npm run seed",
    replicas: { [REGION]: 1 },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      BETTER_AUTH_URL: "https://gym.mattport.com",
      BETTER_AUTH_SECRET: preserve(),
      SEED_EMAIL: preserve(),
      SEED_PASSWORD: preserve(),
    },
  });

  // No domain or healthcheck: it only talks to Postgres. SIGTERM lets it finish its batch.
  const worker = service("worker", {
    source: REPO,
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    start: "node worker/index.ts",
    replicas: { [REGION]: 1 },
    env: { DATABASE_URL: db.env.DATABASE_URL },
  });

  return project("gym", {
    variables: { managed: true },
    resources: [db, dbVolume, web, worker],
  });
});

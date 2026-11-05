import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../server/utils/schema.ts";
import { replayAll } from "../worker/process.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = drizzle(process.env.DATABASE_URL, { schema });
const count = await replayAll(db);
console.log(`analyses rebuilt for ${count} exercises`);
await db.$client.end();

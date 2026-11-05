/** Claims a batch, reports it, then hangs with the transaction open until it is killed. */
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../server/utils/schema.ts";
import { processBatch } from "../worker/process.ts";

const db = drizzle(process.env.DATABASE_URL!, { schema });

await processBatch(db, {
  afterClaim: async (rows) => {
    console.log(`claimed ${rows.length}`);
    await new Promise(() => {});
  },
});

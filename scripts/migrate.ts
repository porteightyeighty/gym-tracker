import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = drizzle(process.env.DATABASE_URL);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");
await db.$client.end();

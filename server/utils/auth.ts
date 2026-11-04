import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "./schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Signed session cookie skips the session DB lookup on most API requests.
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
});

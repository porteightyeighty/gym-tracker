import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../server/utils/schema.ts";

const email = process.env.SEED_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_PASSWORD;

if (!email || !password) {
  console.error("Set SEED_EMAIL and SEED_PASSWORD, e.g.\n  SEED_EMAIL=me@example.com SEED_PASSWORD=secret npm run seed");
  process.exit(1);
}
if (password.length < 8) {
  console.error("SEED_PASSWORD must be at least 8 characters");
  process.exit(1);
}

const db = drizzle(process.env.DATABASE_URL!, { schema });

const LIFTS: [string, string][] = [
  ["Back squat", "barbell"],
  ["Front squat", "barbell"],
  ["Deadlift", "barbell"],
  ["Romanian deadlift", "barbell"],
  ["Bench press", "barbell"],
  ["Overhead press", "barbell"],
  ["Barbell row", "barbell"],
  ["Hip thrust", "barbell"],
  ["Dumbbell bench press", "dumbbell"],
  ["Dumbbell row", "dumbbell"],
  ["Dumbbell shoulder press", "dumbbell"],
  ["Dumbbell curl", "dumbbell"],
  ["Lateral raise", "dumbbell"],
  ["Bulgarian split squat", "dumbbell"],
  ["Leg press", "machine"],
  ["Leg extension", "machine"],
  ["Leg curl", "machine"],
  ["Chest press machine", "machine"],
  ["Lat pulldown", "cable"],
  ["Seated cable row", "cable"],
  ["Cable triceps pushdown", "cable"],
  ["Cable face pull", "cable"],
  ["Pull-up", "bodyweight"],
  ["Push-up", "bodyweight"],
  ["Dip", "bodyweight"],
  ["Plank", "bodyweight"],
  ["Incline bench press", "barbell"],
  ["Incline dumbbell press", "dumbbell"],
  ["Hammer curl", "dumbbell"],
  ["Goblet squat", "dumbbell"],
  ["Dumbbell lunge", "dumbbell"],
  ["Shoulder press machine", "machine"],
  ["Pec deck", "machine"],
  ["Rear delt machine", "machine"],
  ["Bicep curl machine", "machine"],
  ["Triceps extension machine", "machine"],
  ["Ab crunch machine", "machine"],
  ["Hip adduction", "machine"],
  ["Hip abduction", "machine"],
  ["Glute kickback machine", "machine"],
  ["Hack squat", "machine"],
  ["Smith machine squat", "machine"],
  ["Seated calf raise", "machine"],
  ["Standing calf raise", "machine"],
  ["Back extension", "machine"],
  ["Assisted pull-up", "machine"],
  ["Cable fly", "cable"],
  ["Cable lateral raise", "cable"],
  ["Cable bicep curl", "cable"],
  ["Overhead cable triceps extension", "cable"],
  ["Straight-arm pulldown", "cable"],
  ["Cable crunch", "cable"],
  ["Cable woodchop", "cable"],
  ["Chin-up", "bodyweight"],
  ["Hanging leg raise", "bodyweight"],
  ["Kettlebell swing", "other"],
];

await db.insert(schema.exercises).values(LIFTS.map(([name, type]) => ({ name, type }))).onConflictDoNothing();
console.log(`exercises: ${LIFTS.length} seeded`);

const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email));

if (existing) {
  await db
    .update(schema.account)
    .set({ password: await hashPassword(password), updatedAt: new Date() })
    .where(eq(schema.account.userId, existing.id));
  console.log(`user ${email}: password reset`);
} else {
  const userId = crypto.randomUUID();
  await db.insert(schema.user).values({
    id: userId,
    name: email.split("@")[0],
    email,
    emailVerified: true,
  });
  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
  console.log(`user ${email}: created`);
}

await db.$client.end();

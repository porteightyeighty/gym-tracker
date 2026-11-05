import { eq } from "drizzle-orm";
import { isCardio } from "~~/shared/equipment";
import type { SetInput } from "./setInput";

/** Cardio exercises take a duration, everything else weight × reps; the body must match. */
export async function assertSetMatchesExercise(input: SetInput) {
  const [exercise] = await db
    .select({ type: exercises.type })
    .from(exercises)
    .where(eq(exercises.id, input.exerciseId))
    .limit(1);
  if (!exercise) throw createError({ statusCode: 400, statusMessage: "Unknown exercise" });
  const cardio = isCardio(exercise.type);
  if (cardio && input.durationSeconds === null) {
    throw createError({ statusCode: 400, statusMessage: "Cardio needs a duration" });
  }
  if (!cardio && input.durationSeconds !== null) {
    throw createError({ statusCode: 400, statusMessage: "Only cardio takes a duration" });
  }
}

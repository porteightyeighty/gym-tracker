export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "other",
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

export function isEquipment(value: unknown): value is Equipment {
  return typeof value === "string" && (EQUIPMENT as readonly string[]).includes(value);
}

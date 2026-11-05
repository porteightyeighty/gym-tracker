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

/** Smallest practical jump in load for double progression. Unknown types fall back to 2.5 kg. */
export const WEIGHT_INCREMENT_KG: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 2.5,
  bodyweight: 2.5,
  other: 2.5,
};

export function weightIncrement(type: string): number {
  return isEquipment(type) ? WEIGHT_INCREMENT_KG[type] : 2.5;
}

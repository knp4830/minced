import type { MeTargets } from "@/lib/me/types";

/*
 * The calendar's nutrition marker. THE THRESHOLDS ARE THE OWNER'S TO CHANGE (open question in the wave 8
 * report): a day counts as "goal hit" when calories land inside the band and protein reaches the floor.
 * Anything else with food logged is "partly". Without targets there is no goal, so a day is just "logged".
 */
export const KCAL_BAND = { min: 0.85, max: 1.1 } as const;
export const PROTEIN_FLOOR = 0.9;

export type FoodStatus = "none" | "logged" | "hit" | "part";

export function dayFoodStatus(
  day: { calories: number; proteinG: number; entries: number },
  targets: Pick<MeTargets, "kcal" | "proteinG"> | null,
): { status: FoodStatus; note: string } {
  if (day.entries <= 0) return { status: "none", note: "No meals logged" };
  if (!targets) return { status: "logged", note: "Set targets to see how the day went" };

  const proteinOk = day.proteinG >= targets.proteinG * PROTEIN_FLOOR;
  const kcalLow = day.calories < targets.kcal * KCAL_BAND.min;
  const kcalHigh = day.calories > targets.kcal * KCAL_BAND.max;
  if (proteinOk && !kcalLow && !kcalHigh) return { status: "hit", note: "Goal hit" };

  if (!proteinOk) return { status: "part", note: `Protein short by ${Math.round(targets.proteinG - day.proteinG)} g` };
  if (kcalLow) return { status: "part", note: `${Math.round(targets.kcal - day.calories).toLocaleString("en-GB")} kcal under goal` };
  return { status: "part", note: `${Math.round(day.calories - targets.kcal).toLocaleString("en-GB")} kcal over goal` };
}

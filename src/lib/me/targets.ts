/*
 * Daily targets: calories and macros from a person's body and goal. Pure; no I/O.
 *
 * Formula (the design's "Mifflin-St Jeor, adjusted for activity and goal"):
 *   resting rate  = 10 x kg + 6.25 x cm - 5 x age + (male 5 | female -161)    [Mifflin et al., 1990]
 *   maintenance   = resting rate x activity factor
 *   target        = maintenance +/- (pace kg per week x 1000 kcal), rounded to the nearest 50
 *   protein       = 1.9 g per kg of body weight
 *   fat           = 0.9 g per kg of body weight
 *   carbs         = whatever calories are left, in 5 g steps
 *
 * "1000 kcal per kg per week" is the design's own simplification (0.5 kg a week = a 500 kcal day). The usual
 * rule of thumb is nearer 1100, so this is slightly gentle. It is one constant below.
 */

export type Sex = "female" | "male";
export type Units = "metric" | "imperial";
export type Goal = "lose" | "maintain" | "gain";

export const ACTIVITY = [
  { v: 0, label: "Sedentary", desc: "Desk job, little or no exercise", factor: 1.2 },
  { v: 1, label: "Lightly active", desc: "Light exercise 1–3 days a week", factor: 1.375 },
  { v: 2, label: "Moderately active", desc: "Training 3–5 days a week", factor: 1.55 },
  { v: 3, label: "Very active", desc: "Hard training 6–7 days a week", factor: 1.725 },
  { v: 4, label: "Extra active", desc: "Physical job plus daily training", factor: 1.9 },
] as const;

export const GOALS: { v: Goal; label: string }[] = [
  { v: "lose", label: "Lose" },
  { v: "maintain", label: "Maintain" },
  { v: "gain", label: "Gain" },
];

export const PACES_KG = [0.25, 0.5, 0.75] as const;

/** Design default: a daily kcal change per kg-per-week of pace. */
export const KCAL_PER_KG_PER_WEEK = 1000;
export const PROTEIN_G_PER_KG = 1.9;
export const FAT_G_PER_KG = 0.9;
/** Never suggest less than this; the person can still type a lower number (the database allows 800). */
export const MIN_SUGGESTED_KCAL = 1200;

export type TargetInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: number;
  goal: Goal;
  paceKg: number;
};

export type Targets = { bmr: number; maintenance: number; kcal: number; proteinG: number; carbsG: number; fatG: number };

export function restingRate(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "female" ? -161 : 5);
}

export function computeTargets(i: TargetInput): Targets {
  const bmr = restingRate(i.sex, i.weightKg, i.heightCm, i.age);
  const factor = ACTIVITY[Math.min(Math.max(Math.round(i.activity), 0), 4)].factor;
  const maintenance = bmr * factor;
  const delta = i.goal === "maintain" ? 0 : i.paceKg * KCAL_PER_KG_PER_WEEK * (i.goal === "lose" ? -1 : 1);
  const kcal = Math.max(MIN_SUGGESTED_KCAL, Math.round((maintenance + delta) / 50) * 50);
  const proteinG = Math.round(i.weightKg * PROTEIN_G_PER_KG);
  const fatG = Math.round(i.weightKg * FAT_G_PER_KG);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 20) * 5);
  return { bmr: Math.round(bmr), maintenance: Math.round(maintenance), kcal, proteinG, carbsG, fatG };
}

/** Energy in a macro split, for the ring. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

// ---- unit conversion (metric is what is stored) ----
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };
}
export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * CM_PER_IN * 10) / 10;
}
export function kgToLb(kg: number): number {
  return Math.round(kg / KG_PER_LB);
}
export function lbToKg(lb: number): number {
  return Math.round(lb * KG_PER_LB * 10) / 10;
}

/** Plain-language note under the pace chips. */
export function paceNote(goal: Goal, paceKg: number): string {
  if (goal === "maintain") return "Eat at maintenance — no deficit or surplus.";
  const kcal = Math.round(paceKg * KCAL_PER_KG_PER_WEEK);
  return `About ${paceKg} kg per week · a ${kcal} kcal daily ${goal === "lose" ? "deficit" : "surplus"}.`;
}

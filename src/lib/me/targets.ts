/*
 * Daily targets: calories and macros from a person's body and goal. Pure; no I/O.
 *
 * Formula:
 *   resting rate  = 10 x kg + 6.25 x cm - 5 x age + (male 5 | female -161)    [Mifflin-St Jeor, 1990]
 *   maintenance   = resting rate x activity factor, rounded to the nearest 10
 *   adjustment    = pace (kg per week) x 7,700 kcal per kg / 7 days           [the ~7,700 kcal-per-kg rule]
 *   target        = maintenance - adjustment (losing) or + adjustment (gaining)
 *   floor         = never suggest below 1,200 kcal (women) or 1,500 kcal (men) [common minimum guidance]
 *   protein       = 1.9 g per kg of body weight
 *   fat           = 0.9 g per kg of body weight
 *   carbs         = whatever calories are left, in 5 g steps
 *
 * Sources: Mifflin MD et al., "A new predictive equation for resting energy expenditure in healthy
 * individuals", Am J Clin Nutr 1990. The activity multipliers are the usual 1.2 to 1.9 table. One kilogram of
 * body weight is commonly taken as about 7,700 kcal (3,500 kcal per pound); it is a rule of thumb, not a
 * promise, because bodies adapt. The 1,200 / 1,500 kcal minimums are the widely used lower limits for
 * unsupervised dieting. Protein and fat per kg are this app's own defaults.
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

/** About 7,700 kcal per kilogram of body weight (3,500 per pound). */
export const KCAL_PER_KG = 7700;
export const PROTEIN_G_PER_KG = 1.9;
export const FAT_G_PER_KG = 0.9;
/** Never suggest less than this; the person can still type a lower number (the database allows 800). */
export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

export type TargetInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: number;
  goal: Goal;
  paceKg: number;
};

export type Targets = {
  bmr: number;
  factor: number;
  /** Resting rate x activity, to the nearest 10. */
  maintenance: number;
  /** Daily change for the pace, always positive (the goal says which way). */
  adjustment: number;
  /** maintenance -/+ adjustment, before the floor. */
  rawKcal: number;
  /** The suggestion: rawKcal, never below the floor. */
  kcal: number;
  floor: number;
  /** True when rawKcal was below the floor and the suggestion was lifted to it. */
  clamped: boolean;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export function restingRate(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "female" ? -161 : 5);
}

/** Daily kcal change for a pace in kg per week: 0.5 kg/week = 550 kcal/day. */
export function dailyAdjustment(paceKg: number): number {
  return Math.round(((paceKg * KCAL_PER_KG) / 7) / 5) * 5;
}

export function activityFactor(activity: number): number {
  return ACTIVITY[Math.min(Math.max(Math.round(activity), 0), 4)].factor;
}

export function computeTargets(i: TargetInput): Targets {
  const bmr = restingRate(i.sex, i.weightKg, i.heightCm, i.age);
  const factor = activityFactor(i.activity);
  const maintenance = Math.round((bmr * factor) / 10) * 10;
  const adjustment = i.goal === "maintain" ? 0 : dailyAdjustment(i.paceKg);
  const rawKcal = maintenance + (i.goal === "lose" ? -adjustment : i.goal === "gain" ? adjustment : 0);
  const floor = MIN_KCAL[i.sex];
  const clamped = rawKcal < floor;
  const kcal = clamped ? floor : rawKcal;
  const proteinG = Math.round(i.weightKg * PROTEIN_G_PER_KG);
  const fatG = Math.round(i.weightKg * FAT_G_PER_KG);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 20) * 5);
  return { bmr: Math.round(bmr), factor, maintenance, adjustment, rawKcal, kcal, floor, clamped, proteinG, carbsG, fatG };
}

/** Energy in a macro split, for the ring. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

const nf = new Intl.NumberFormat("en-GB");
const n = (v: number) => nf.format(Math.round(v));

/**
 * The calculation in plain words, one step per line, so the person can follow it and check it.
 * `lines[0..]` are for the full "How this is calculated" view; `oneLine` is the short form for the result step.
 */
export function explainTargets(i: TargetInput, t: Targets): { oneLine: string; lines: string[] } {
  const act = ACTIVITY[Math.min(Math.max(Math.round(i.activity), 0), 4)];
  const sexTerm = i.sex === "female" ? "− 161 (women)" : "+ 5 (men)";
  const lines: string[] = [
    `Resting energy: 10 × ${i.weightKg} kg + 6.25 × ${i.heightCm} cm − 5 × ${i.age} years ${sexTerm} = ${n(t.bmr)} kcal (Mifflin–St Jeor).`,
    `Activity: ${n(t.bmr)} × ${act.factor} (${act.label.toLowerCase()}) = ${n(t.maintenance)} kcal to hold your weight.`,
  ];
  let oneLine = `Resting ${n(t.bmr)} kcal × ${act.factor} ${act.label.toLowerCase()} = ${n(t.maintenance)}`;
  if (i.goal === "maintain") {
    lines.push(`Goal: maintain, so no adjustment. Target ${n(t.kcal)} kcal.`);
    oneLine += `; no change for maintaining = ${n(t.kcal)}`;
  } else {
    const verb = i.goal === "lose" ? "minus" : "plus";
    lines.push(
      `Pace: ${i.paceKg} kg a week × 7,700 kcal per kg (about 3,500 per lb) ÷ 7 days = ${n(t.adjustment)} kcal a day, ${verb} that = ${n(t.rawKcal)} kcal.`,
    );
    oneLine += `; ${verb} ${n(t.adjustment)} for ${i.paceKg} kg/week = ${n(t.rawKcal)}`;
  }
  if (t.clamped) {
    const who = i.sex === "female" ? "women" : "men";
    lines.push(
      `That is below ${n(t.floor)} kcal, the lowest we suggest for ${who}, so the target is held at ${n(t.floor)}.${i.goal === "lose" ? ` Your pace will be slower than ${i.paceKg} kg a week.` : ""}`,
    );
    oneLine += `. That is under the ${n(t.floor)} kcal minimum we suggest, so the target stays at ${n(t.floor)}`;
  }
  lines.push(`Protein 1.9 g per kg = ${n(t.proteinG)} g. Fat 0.9 g per kg = ${n(t.fatG)} g. Carbs fill the rest = ${n(t.carbsG)} g.`);
  return { oneLine, lines };
}

// ---- projected date ----

/**
 * Days to get from `fromKg` to `goalKg` at `paceKg` a week, or null when there is nothing to project: no pace,
 * no goal, or a goal on the wrong side of where you are for the direction (losing toward a heavier weight).
 */
export function daysToGoal(fromKg: number, goalKg: number | null, goal: Goal, paceKg: number): number | null {
  if (goalKg === null || goal === "maintain" || paceKg <= 0) return null;
  const diff = goal === "lose" ? fromKg - goalKg : goalKg - fromKg;
  if (diff <= 0) return null;
  return Math.ceil((diff / paceKg) * 7);
}

// ---- unit conversion (metric is what is stored) ----
const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;

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
/** One decimal, for weigh-ins (a whole pound is too coarse to see a trend). */
export function kgToLb1(kg: number): number {
  return Math.round((kg / KG_PER_LB) * 10) / 10;
}
export function lbToKg(lb: number): number {
  return Math.round(lb * KG_PER_LB * 10) / 10;
}

/** A weight in the person's units, e.g. "84.0 kg" or "185.2 lb". */
export function formatWeight(kg: number, units: Units): string {
  return units === "imperial" ? `${kgToLb1(kg).toFixed(1)} lb` : `${(Math.round(kg * 10) / 10).toFixed(1)} kg`;
}

/** The pace chip label. Pace is stored in kg; imperial shows the pounds beside it. */
export function paceLabel(paceKg: number, units: Units): string {
  return units === "imperial" ? `${kgToLb1(paceKg)} lb` : `${paceKg} kg`;
}

/** Plain-language note under the pace chips. */
export function paceNote(goal: Goal, paceKg: number, units: Units = "metric"): string {
  if (goal === "maintain") return "Eat at maintenance — no deficit or surplus.";
  const kcal = dailyAdjustment(paceKg);
  return `About ${paceLabel(paceKg, units)} per week · a ${nf.format(kcal)} kcal daily ${goal === "lose" ? "deficit" : "surplus"}.`;
}

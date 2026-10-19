import type { Goal, Sex, Units } from "@/lib/me/targets";

export const MEALS = [
  { v: "breakfast", label: "Breakfast" },
  { v: "lunch", label: "Lunch" },
  { v: "dinner", label: "Dinner" },
  { v: "snack", label: "Snacks" },
] as const;

export type Meal = (typeof MEALS)[number]["v"];
export const MEAL_VALUES: readonly string[] = MEALS.map((m) => m.v);

export type MeTargets = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  units: Units;
  activity: number;
  goal: Goal;
  paceKg: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Where the person wants to get to; null for maintain or when skipped. */
  goalWeightKg: number | null;
  /** The local date the targets were last saved (YYYY-MM-DD). */
  updatedOn: string;
};

export type FoodEntry = {
  id: string;
  meal: Meal;
  name: string;
  /** Null for a quick add. */
  servings: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Null means unknown, which is not zero. */
  fiberG: number | null;
  sodiumMg: number | null;
  /**
   * Per-nutrient totals for the whole entry, frozen when it was logged (keyed by nutrient `key`).
   * A key that is absent was not reported, which is not zero. Null for quick adds and for rows logged
   * before nutrient data existed.
   */
  nutrients: Record<string, number> | null;
  /** What the entry is: a Minced recipe, an ingredient or brand with an amount, or a hand-typed quick add. */
  source: "recipe" | "food" | "quick";
  recipe: { slug: string; imageUrl: string | null } | null;
};

export type WorkoutEntry = {
  id: string;
  session: string;
  customName: string | null;
  minutes: number | null;
  sets: number;
  muscles: { muscle: string; sets: number }[];
};

export type DayTotals = { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sodiumMg: number; entries: number };

export type DayDetail = {
  date: string;
  food: FoodEntry[];
  workouts: WorkoutEntry[];
  sleep: number | null;
  /** Morning weigh-in in kg, or null. */
  weightKg: number | null;
  totals: DayTotals;
};

/** One calendar day that has anything logged. */
export type DaySummary = {
  date: string;
  calories: number;
  proteinG: number;
  foodEntries: number;
  /** Session labels, e.g. "push" or "custom:Climbing". */
  trained: string[];
  sets: number;
  sleepHours: number | null;
  weightKg: number | null;
};

export type WeekMuscle = { muscle: string; sets: number; days: string[] };

export function emptyTotals(): DayTotals {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sodiumMg: 0, entries: 0 };
}

export function sumFood(entries: FoodEntry[]): DayTotals {
  const t = emptyTotals();
  for (const e of entries) {
    t.calories += e.calories;
    t.proteinG += e.proteinG;
    t.carbsG += e.carbsG;
    t.fatG += e.fatG;
    t.fiberG += e.fiberG ?? 0;
    t.sodiumMg += e.sodiumMg ?? 0;
    t.entries += 1;
  }
  return t;
}

/*
 * Input validation for the Me server actions. Server Actions are public endpoints (LESSONS), so every
 * argument is re-checked here no matter what the form allowed. The brief asked for Zod; Zod is not a
 * dependency and no packages may be added, so these are small hand-written checkers with the same job:
 * each returns the cleaned value or a plain-English reason. Swapping to Zod later is a mechanical change.
 */

import { isIsoDate } from "@/lib/me/dates";
import { UUID_RE } from "@/lib/validate";
import { MEAL_VALUES, type Meal } from "@/lib/me/types";
import { ACTIVITY, PACES_KG, type Goal, type Sex, type Units } from "@/lib/me/targets";
import { MUSCLE_SLUGS, SESSION_VALUES, type MuscleSlug, type Session } from "@/lib/me/muscles";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = (error: string): Parsed<never> => ({ ok: false, error });

// Control and bidirectional-override characters have no place in a food name.
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

export function text(v: unknown, max: number, label: string, required = true): Parsed<string> {
  if (typeof v !== "string") return required ? bad(`${label} is required.`) : ok("");
  const s = v.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  if (!s) return required ? bad(`${label} is required.`) : ok("");
  if (s.length > max) return bad(`${label} is too long (${max} characters at most).`);
  return ok(s);
}

export function num(v: unknown, min: number, max: number, label: string): Parsed<number> {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return bad(`${label} must be a number.`);
  if (n < min || n > max) return bad(`${label} must be between ${min} and ${max}.`);
  return ok(n);
}

export function intIn(v: unknown, min: number, max: number, label: string): Parsed<number> {
  const r = num(v, min, max, label);
  if (!r.ok) return r;
  if (!Number.isInteger(r.value)) return bad(`${label} must be a whole number.`);
  return r;
}

/** A date the person could plausibly be logging: a real date, no more than a day ahead of any time zone, and not years back. */
export function logDate(v: unknown): Parsed<string> {
  if (!isIsoDate(v)) return bad("That date is not valid.");
  const now = Date.now();
  const t = Date.parse(`${v}T00:00:00Z`);
  const DAY = 86_400_000;
  if (t > now + 2 * DAY) return bad("That date is in the future.");
  if (t < now - 3660 * DAY) return bad("That date is too far back.");
  return ok(v);
}

export function oneOf<T extends string>(v: unknown, allowed: readonly string[], label: string): Parsed<T> {
  return typeof v === "string" && allowed.includes(v) ? ok(v as T) : bad(`${label} is not recognised.`);
}

export const meal = (v: unknown) => oneOf<Meal>(v, MEAL_VALUES, "Meal");
export const session = (v: unknown) => oneOf<Session>(v, SESSION_VALUES, "Session");
export const muscle = (v: unknown) => oneOf<MuscleSlug>(v, MUSCLE_SLUGS, "Muscle");

export function uuid(v: unknown): Parsed<string> {
  return typeof v === "string" && UUID_RE.test(v) ? ok(v) : bad("That entry could not be found.");
}

/** Rounds to one decimal, which is what the database columns store. */
export const r1 = (n: number) => Math.round(n * 10) / 10;

export type TargetsInput = {
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
};

export function targetsInput(v: unknown): Parsed<TargetsInput> {
  if (!v || typeof v !== "object") return bad("Targets are missing.");
  const o = v as Record<string, unknown>;
  const sex = oneOf<Sex>(o.sex, ["female", "male"], "Sex");
  if (!sex.ok) return sex;
  const units = oneOf<Units>(o.units, ["metric", "imperial"], "Units");
  if (!units.ok) return units;
  const goal = oneOf<Goal>(o.goal, ["lose", "maintain", "gain"], "Goal");
  if (!goal.ok) return goal;
  const age = intIn(o.age, 13, 110, "Age");
  if (!age.ok) return age;
  const height = num(o.heightCm, 100, 250, "Height");
  if (!height.ok) return height;
  const weight = num(o.weightKg, 30, 300, "Weight");
  if (!weight.ok) return weight;
  const activity = intIn(o.activity, 0, ACTIVITY.length - 1, "Activity");
  if (!activity.ok) return activity;
  const pace = goal.value === "maintain" ? ok(0) : num(o.paceKg, 0.25, 0.75, "Pace");
  if (!pace.ok) return pace;
  if (goal.value !== "maintain" && !(PACES_KG as readonly number[]).includes(pace.value)) return bad("Pick one of the pace options.");
  const kcal = intIn(o.kcal, 800, 6000, "Calories");
  if (!kcal.ok) return kcal;
  const protein = intIn(o.proteinG, 0, 600, "Protein");
  if (!protein.ok) return protein;
  const carbs = intIn(o.carbsG, 0, 1200, "Carbs");
  if (!carbs.ok) return carbs;
  const fat = intIn(o.fatG, 0, 400, "Fat");
  if (!fat.ok) return fat;
  return ok({
    sex: sex.value,
    age: age.value,
    heightCm: r1(height.value),
    weightKg: r1(weight.value),
    units: units.value,
    activity: activity.value,
    goal: goal.value,
    paceKg: pace.value,
    kcal: kcal.value,
    proteinG: protein.value,
    carbsG: carbs.value,
    fatG: fat.value,
  });
}

"use server";

import { revalidatePath } from "next/cache";

import { ME_ENABLED } from "@/lib/me/flag";
import { distributeSets, type MuscleSets } from "@/lib/me/muscles";
import {
  getDayDetail,
  findRecipesToLog,
  getRecipeNutrition,
  removeFood,
  removeSleep,
  removeWeight,
  writeDismissal,
  writeWeight,
  removeWorkout,
  writeFood,
  writeSleep,
  writeTargets,
  writeWorkout,
  type LoggableRecipe,
  type WriteResult,
} from "@/lib/queries/me";
import type { DayDetail } from "@/lib/me/types";
import { CHECKIN_KINDS, type CheckInKind } from "@/lib/me/checkin";
import { SLUG_RE } from "@/lib/validate";
import { checkFoodInput } from "@/lib/foodInput";
import { FDC, MACRO_COLUMNS, byFdc } from "@/lib/nutrients";
import { computeFood } from "@/lib/queries/foods";
import { getNutrients, getRecipeNutrientSnapshot } from "@/lib/queries/recipeNutrients";
import {
  intIn,
  logDate,
  meal,
  muscle,
  num,
  oneOf,
  r1,
  session,
  targetsInput,
  text,
  uuid,
} from "@/lib/me/validate";

/** USDA numbers of the nutrients that have their own diary columns (calories, protein, carbs, fat, fiber, sodium). */
const MACRO_FDC: ReadonlySet<number> = new Set(MACRO_COLUMNS.map((m) => m.fdc));

/*
 * Server Actions for the Me dashboard. Each one is a public endpoint: it re-validates every argument,
 * refuses when the feature flag is off, and lets Row Level Security be the final gate on who owns what.
 * "Date" arguments are the person's local calendar date, sent by the browser.
 */

export type ActionResult = WriteResult;

type Failure = { ok: false; error: string };
const OFF: Failure = { ok: false, error: "This is not available yet." };
const refresh = () => revalidatePath("/me");

function fail(error: string): Failure {
  return { ok: false, error };
}

export async function saveTargets(input: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const t = targetsInput(input);
  if (!t.ok) return fail(t.error);
  const r = await writeTargets(t.value);
  if (r.ok) refresh();
  return r;
}

type QuickFoodInput = {
  kind: "quick";
  date: unknown;
  meal: unknown;
  name: unknown;
  calories: unknown;
  proteinG?: unknown;
  carbsG?: unknown;
  fatG?: unknown;
  fiberG?: unknown;
  sodiumMg?: unknown;
};
type RecipeFoodInput = { kind: "recipe"; date: unknown; meal: unknown; slug: unknown; servings: unknown };
/** An ingredient or brand (picked from the type-ahead) and an amount of it. The server works out the nutrition. */
type PickedFoodInput = {
  kind: "food";
  date: unknown;
  meal: unknown;
  ingredientId: unknown;
  fdcId: unknown;
  quantity: unknown;
  unit: unknown;
  /** Display name; only used as the diary label, bounded below. Never used for nutrition. */
  name: unknown;
};

/** Multiplies a per-serving snapshot by the servings eaten, to one decimal at most. */
function scaleSnapshot(s: Record<string, number> | null, n: number): Record<string, number> | null {
  if (!s) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) out[k] = Math.round(v * n * 100) / 100;
  return out;
}

/** Optional numeric field: blank means "unknown" (null), anything else must be a valid number. */
function optional(v: unknown, min: number, max: number, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return { ok: true, value: null };
  return num(v, min, max, label);
}

export async function logFood(input: QuickFoodInput | RecipeFoodInput | PickedFoodInput): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  if (!input || typeof input !== "object") return fail("Nothing to log.");
  const date = logDate(input.date);
  if (!date.ok) return fail(date.error);
  const m = meal(input.meal);
  if (!m.ok) return fail(m.error);

  if (input.kind === "recipe") {
    if (typeof input.slug !== "string" || !SLUG_RE.test(input.slug)) return fail("That recipe could not be found.");
    const servings = num(input.servings, 0.25, 50, "Servings");
    if (!servings.ok) return fail(servings.error);
    // Nutrition comes from the database, never from the browser.
    const rec = await getRecipeNutrition(input.slug);
    if (!rec) return fail("That recipe could not be found.");
    if (rec.calories === null) return fail("This recipe has no nutrition information yet, so it cannot be added up. Use a quick add instead.");
    const n = servings.value;
    // Every other nutrient (vitamins, minerals, sugars...) is frozen from the computed per-serving rows.
    const snapshot = scaleSnapshot(await getRecipeNutrientSnapshot(rec.id), n);
    const r = await writeFood({
      date: date.value,
      meal: m.value,
      recipeId: rec.id,
      name: rec.title.slice(0, 120),
      servings: n,
      // The recipe page shows calories to the nearest 5; log that number so the diary matches the page.
      calories: r1(Math.round(rec.calories / 5) * 5 * n),
      proteinG: r1((rec.proteinG ?? 0) * n),
      carbsG: r1((rec.carbsG ?? 0) * n),
      fatG: r1((rec.fatG ?? 0) * n),
      fiberG: rec.fiberG === null ? null : r1(rec.fiberG * n),
      sodiumMg: rec.sodiumMg === null ? null : r1(rec.sodiumMg * n),
      nutrients: snapshot,
    });
    if (r.ok) refresh();
    return r;
  }

  if (input.kind === "food") {
    const v = checkFoodInput(input);
    if (!v.ok) return fail(v.error);
    const name = text(input.name, 120, "Name");
    if (!name.ok) return fail(name.error);
    // Nutrition is computed here from the database, never taken from the browser.
    const c = await computeFood(v);
    if (!c.ok) {
      return fail(
        c.reason === "unit"
          ? "That unit is not recognised."
          : c.reason === "no_data"
            ? "We have no nutrition data for that amount, so it cannot be added up. Try grams, or use a quick add."
            : "The calculation is not available right now. Try a quick add instead.",
      );
    }
    const nutrients = await getNutrients();
    const val = (fdc: number): number | null => {
      const n = byFdc(nutrients, fdc);
      return n && n.key in c.food.byKey ? c.food.byKey[n.key] : null;
    };
    const kcal = val(FDC.energy);
    if (kcal === null) return fail("We have no calorie figure for that food, so it cannot be added up. Use a quick add instead.");
    const r = await writeFood({
      date: date.value,
      meal: m.value,
      recipeId: null,
      name: name.value,
      servings: null,
      calories: r1(kcal),
      proteinG: r1(val(FDC.protein) ?? 0),
      carbsG: r1(val(FDC.carbs) ?? 0),
      fatG: r1(val(FDC.fat) ?? 0),
      fiberG: val(FDC.fiber) === null ? null : r1(val(FDC.fiber) as number),
      sodiumMg: val(FDC.sodium) === null ? null : r1(val(FDC.sodium) as number),
      // The macro columns above are the source of truth for those six; the snapshot holds the rest.
      nutrients: scaleSnapshot(
        Object.fromEntries(
          c.food.rows.filter((r) => r.nutrient.fdcNumber === null || !MACRO_FDC.has(r.nutrient.fdcNumber)).map((r) => [r.nutrient.key, r.amount]),
        ),
        1,
      ),
    });
    if (r.ok) refresh();
    return r;
  }

  if (input.kind !== "quick") return fail("Nothing to log.");
  const name = text(input.name, 120, "Name");
  if (!name.ok) return fail(name.error);
  const calories = num(input.calories, 0, 20000, "Calories");
  if (!calories.ok) return fail(calories.error);
  const protein = optional(input.proteinG, 0, 2000, "Protein");
  const carbs = optional(input.carbsG, 0, 3000, "Carbs");
  const fat = optional(input.fatG, 0, 1500, "Fat");
  const fiber = optional(input.fiberG, 0, 500, "Fiber");
  const sodium = optional(input.sodiumMg, 0, 50000, "Sodium");
  for (const f of [protein, carbs, fat, fiber, sodium]) if (!f.ok) return fail(f.error);
  const val = (f: typeof protein): number | null => (f.ok ? f.value : null);

  const r = await writeFood({
    date: date.value,
    meal: m.value,
    recipeId: null,
    name: name.value,
    servings: null,
    calories: r1(calories.value),
    proteinG: r1(val(protein) ?? 0),
    carbsG: r1(val(carbs) ?? 0),
    fatG: r1(val(fat) ?? 0),
    fiberG: val(fiber) === null ? null : r1(val(fiber) as number),
    sodiumMg: val(sodium) === null ? null : r1(val(sodium) as number),
  });
  if (r.ok) refresh();
  return r;
}

export async function deleteFood(id: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const v = uuid(id);
  if (!v.ok) return fail(v.error);
  const r = await removeFood(v.value);
  if (r.ok) refresh();
  return r;
}

type WorkoutInput = {
  date: unknown;
  session: unknown;
  customName?: unknown;
  minutes?: unknown;
  /** Total working sets, spread over the session's muscles (preset sessions). */
  sets?: unknown;
  /** Picked by hand (Custom): [{ muscle, sets }]. */
  muscles?: unknown;
};

export async function logWorkout(input: WorkoutInput): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  if (!input || typeof input !== "object") return fail("Nothing to log.");
  const date = logDate(input.date);
  if (!date.ok) return fail(date.error);
  const s = session(input.session);
  if (!s.ok) return fail(s.error);

  const minutes = optional(input.minutes, 1, 600, "Minutes");
  if (!minutes.ok) return fail(minutes.error);
  if (minutes.value !== null && !Number.isInteger(minutes.value)) return fail("Minutes must be a whole number.");

  let sets: MuscleSets = [];
  let customName: string | null = null;

  if (s.value === "cardio") {
    if (minutes.value === null) return fail("Add how many minutes.");
  } else if (s.value === "custom") {
    const name = text(input.customName, 60, "Name", false);
    if (!name.ok) return fail(name.error);
    customName = name.value || null;
    if (!Array.isArray(input.muscles) || input.muscles.length < 1 || input.muscles.length > 16) return fail("Pick at least one muscle.");
    const seen = new Set<string>();
    for (const row of input.muscles as { muscle?: unknown; sets?: unknown }[]) {
      const mu = muscle(row?.muscle);
      if (!mu.ok) return fail(mu.error);
      if (seen.has(mu.value)) return fail("Each muscle can be listed once.");
      seen.add(mu.value);
      const n = intIn(row?.sets, 1, 100, "Sets");
      if (!n.ok) return fail(n.error);
      sets.push({ muscle: mu.value, sets: n.value });
    }
  } else {
    const total = intIn(input.sets, 1, 300, "Sets");
    if (!total.ok) return fail(total.error);
    sets = distributeSets(s.value, total.value);
  }

  const r = await writeWorkout({ date: date.value, session: s.value, customName, minutes: minutes.value, muscles: sets });
  if (r.ok) refresh();
  return r;
}

export async function deleteWorkout(id: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const v = uuid(id);
  if (!v.ok) return fail(v.error);
  const r = await removeWorkout(v.value);
  if (r.ok) refresh();
  return r;
}

export async function logSleep(dateIn: unknown, hoursIn: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const date = logDate(dateIn);
  if (!date.ok) return fail(date.error);
  const hours = num(hoursIn, 0, 24, "Hours");
  if (!hours.ok) return fail(hours.error);
  // Half-hour steps are what the slider offers; anything finer is rounded, not rejected.
  const r = await writeSleep(date.value, Math.round(hours.value * 2) / 2);
  if (r.ok) refresh();
  return r;
}

export async function clearSleep(dateIn: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const date = logDate(dateIn);
  if (!date.ok) return fail(date.error);
  const r = await removeSleep(date.value);
  if (r.ok) refresh();
  return r;
}

/** A morning weigh-in. The input is in kilograms; the browser converts from pounds first. Stored to 0.1 kg. */
export async function logWeight(dateIn: unknown, kgIn: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const date = logDate(dateIn);
  if (!date.ok) return fail(date.error);
  const kg = num(kgIn, 30, 300, "Weight");
  if (!kg.ok) return fail(kg.error);
  const r = await writeWeight(date.value, r1(kg.value));
  if (r.ok) refresh();
  return r;
}

export async function clearWeight(dateIn: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const date = logDate(dateIn);
  if (!date.ok) return fail(date.error);
  const r = await removeWeight(date.value);
  if (r.ok) refresh();
  return r;
}

/** "Not now" on an "Update your targets?" card. Remembered in the database, so it follows the person between devices. */
export async function dismissCheckIn(kindIn: unknown, dateIn: unknown): Promise<ActionResult> {
  if (!ME_ENABLED) return OFF;
  const kind = oneOf<CheckInKind>(kindIn, CHECKIN_KINDS, "Check-in");
  if (!kind.ok) return fail(kind.error);
  const date = logDate(dateIn);
  if (!date.ok) return fail(date.error);
  const r = await writeDismissal(kind.value, date.value);
  if (r.ok) refresh();
  return r;
}

/** Read actions: the calendar's day detail and the food dialog's recipe search. */
export async function loadDay(dateIn: unknown): Promise<{ ok: true; day: DayDetail } | { ok: false; error: string }> {
  if (!ME_ENABLED) return OFF;
  const date = logDate(dateIn);
  if (!date.ok) return fail(date.error);
  try {
    return { ok: true, day: await getDayDetail(date.value) };
  } catch {
    return fail("Could not load that day.");
  }
}

export async function searchRecipes(q: unknown): Promise<{ ok: true; recipes: LoggableRecipe[] } | { ok: false; error: string }> {
  if (!ME_ENABLED) return OFF;
  const t = text(q, 60, "Search", false);
  if (!t.ok) return fail(t.error);
  try {
    return { ok: true, recipes: await findRecipesToLog(t.value) };
  } catch {
    return fail("Search did not work. Please try again.");
  }
}

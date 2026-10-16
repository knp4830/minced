/*
 * Database access for the Me dashboard. Every call goes through the request-scoped, cookie-carrying client,
 * so Row Level Security is the real gate: a person can only ever read or write their own rows. Nothing here
 * may be called from a cached (ISR) page.
 *
 * Cast: src/types/database.ts is regenerated at integration, after migration 20261016100000 is applied, so
 * the me_* tables are not in it yet. Remove `loose()` after `pnpm db:types`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { addDays, weekRange } from "@/lib/me/dates";
import {
  sumFood,
  type DayDetail,
  type DaySummary,
  type FoodEntry,
  type Meal,
  type MeTargets,
  type WeekMuscle,
  type WorkoutEntry,
} from "@/lib/me/types";

async function loose(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ---------- targets ----------

type TargetRow = {
  sex: "female" | "male";
  age_years: number;
  height_cm: number | string;
  weight_kg: number | string;
  units: "metric" | "imperial";
  activity: number;
  goal: "lose" | "maintain" | "gain";
  pace_kg: number | string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export async function getTargets(): Promise<MeTargets | null> {
  const db = await loose();
  const { data } = await db
    .from("me_targets")
    .select("sex, age_years, height_cm, weight_kg, units, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g")
    .maybeSingle();
  const r = data as TargetRow | null;
  if (!r) return null;
  return {
    sex: r.sex,
    age: r.age_years,
    heightCm: num(r.height_cm),
    weightKg: num(r.weight_kg),
    units: r.units,
    activity: r.activity,
    goal: r.goal,
    paceKg: num(r.pace_kg),
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
  };
}

// ---------- one day ----------

type FoodRow = {
  id: string;
  meal: Meal;
  name: string;
  servings: number | string | null;
  calories: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  fiber_g: number | string | null;
  sodium_mg: number | string | null;
  recipes: { slug: string; image_url: string | null } | { slug: string; image_url: string | null }[] | null;
};

export async function getFoodForDate(date: string): Promise<FoodEntry[]> {
  const db = await loose();
  const { data } = await db
    .from("me_food_log")
    .select("id, meal, name, servings, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, recipes(slug, image_url)")
    .eq("log_date", date)
    .order("created_at", { ascending: true })
    .limit(80);
  return ((data ?? []) as FoodRow[]).map((r) => {
    const rec = Array.isArray(r.recipes) ? (r.recipes[0] ?? null) : r.recipes;
    return {
      id: r.id,
      meal: r.meal,
      name: r.name,
      servings: numOrNull(r.servings),
      calories: num(r.calories),
      proteinG: num(r.protein_g),
      carbsG: num(r.carbs_g),
      fatG: num(r.fat_g),
      fiberG: numOrNull(r.fiber_g),
      sodiumMg: numOrNull(r.sodium_mg),
      recipe: rec ? { slug: rec.slug, imageUrl: rec.image_url } : null,
    };
  });
}

type WorkoutRow = {
  id: string;
  session: string;
  custom_name: string | null;
  minutes: number | null;
  sets: number;
  me_workout_muscles: { muscle: string; sets: number }[] | null;
};

export async function getWorkoutsForDate(date: string): Promise<WorkoutEntry[]> {
  const db = await loose();
  const { data } = await db
    .from("me_workouts")
    .select("id, session, custom_name, minutes, sets, me_workout_muscles(muscle, sets)")
    .eq("log_date", date)
    .order("created_at", { ascending: true })
    .limit(20);
  return ((data ?? []) as WorkoutRow[]).map((w) => ({
    id: w.id,
    session: w.session,
    customName: w.custom_name,
    minutes: w.minutes,
    sets: w.sets,
    muscles: (w.me_workout_muscles ?? []).map((m) => ({ muscle: m.muscle, sets: m.sets })),
  }));
}

export async function getSleepForDate(date: string): Promise<number | null> {
  const db = await loose();
  const { data } = await db.from("me_sleep").select("hours").eq("log_date", date).maybeSingle();
  return data ? numOrNull((data as { hours: number | string }).hours) : null;
}

export async function getDayDetail(date: string): Promise<DayDetail> {
  const [food, workouts, sleep] = await Promise.all([getFoodForDate(date), getWorkoutsForDate(date), getSleepForDate(date)]);
  return { date, food, workouts, sleep, totals: sumFood(food) };
}

// ---------- week and month ----------

export async function getWeekMuscles(date: string): Promise<{ from: string; to: string; muscles: WeekMuscle[] }> {
  const { from, to } = weekRange(date);
  const db = await loose();
  const { data } = await db.rpc("me_week_muscles", { p_from: from, p_to: to });
  const muscles = ((data ?? []) as { muscle: string; sets: number | string; days: string[] }[]).map((r) => ({
    muscle: r.muscle,
    sets: Number(r.sets),
    days: r.days,
  }));
  return { from, to, muscles };
}

type SummaryRow = {
  log_date: string;
  calories: number | string | null;
  protein_g: number | string | null;
  food_entries: number | null;
  trained: string[] | null;
  sets: number | null;
  sleep_hours: number | string | null;
};

export async function getMonthSummary(from: string, to: string): Promise<DaySummary[]> {
  const db = await loose();
  const { data } = await db.rpc("me_month_summary", { p_from: from, p_to: to });
  return ((data ?? []) as SummaryRow[]).map((r) => ({
    date: r.log_date,
    calories: num(r.calories),
    proteinG: num(r.protein_g),
    foodEntries: r.food_entries ?? 0,
    trained: r.trained ?? [],
    sets: r.sets ?? 0,
    sleepHours: numOrNull(r.sleep_hours),
  }));
}

/** Whether the person has logged anything, ever (drives the brand-new empty state). */
export async function hasAnyLog(): Promise<boolean> {
  const db = await loose();
  const [f, w, s] = await Promise.all([
    db.from("me_food_log").select("id", { count: "exact", head: true }).limit(1),
    db.from("me_workouts").select("id", { count: "exact", head: true }).limit(1),
    db.from("me_sleep").select("log_date", { count: "exact", head: true }).limit(1),
  ]);
  return (f.count ?? 0) + (w.count ?? 0) + (s.count ?? 0) > 0;
}

/** Calendar range for a month grid: whole weeks, but capped to the 62 days the RPC allows. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = addDays(first, new Date(Date.UTC(year, month, 0)).getUTCDate() - 1);
  return { from: first, to: last };
}

// ---------- recipes for the food dialog ----------

export type LoggableRecipe = {
  slug: string;
  title: string;
  servings: number;
  calories: number | null;
  imageUrl: string | null;
};

type RecipeRow = {
  id: string;
  slug: string;
  title: string;
  servings: number;
  calories: number | string | null;
  image_url: string | null;
};

/** Escapes LIKE wildcards so a search for "100%" is a literal search. */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function findRecipesToLog(query: string, limit = 8): Promise<LoggableRecipe[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];
  const db = await loose();
  const { data } = await db
    .from("recipes")
    .select("id, slug, title, servings, calories, image_url")
    .eq("status", "published")
    .ilike("title", `%${likeEscape(q)}%`)
    .order("has_photo", { ascending: false })
    .order("title", { ascending: true })
    .limit(limit);
  return ((data ?? []) as RecipeRow[]).map((r) => ({
    slug: r.slug,
    title: r.title,
    servings: r.servings,
    calories: numOrNull(r.calories),
    imageUrl: r.image_url,
  }));
}

export type RecipeNutrition = {
  id: string;
  slug: string;
  title: string;
  servings: number;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
};

/** Per-serving nutrition read from the database, never from the client. */
export async function getRecipeNutrition(slug: string): Promise<RecipeNutrition | null> {
  const db = await loose();
  const { data } = await db
    .from("recipes")
    .select("id, slug, title, servings, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg")
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  const r = data as
    | {
        id: string;
        slug: string;
        title: string;
        servings: number;
        calories: number | string | null;
        protein_g: number | string | null;
        carbs_g: number | string | null;
        fat_g: number | string | null;
        fiber_g: number | string | null;
        sodium_mg: number | string | null;
      }
    | null;
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    servings: r.servings,
    calories: numOrNull(r.calories),
    proteinG: numOrNull(r.protein_g),
    carbsG: numOrNull(r.carbs_g),
    fatG: numOrNull(r.fat_g),
    fiberG: numOrNull(r.fiber_g),
    sodiumMg: numOrNull(r.sodium_mg),
  };
}

// ---------- writes (called only from src/lib/actions/me.ts, which validates first) ----------

export type WriteResult = { ok: true } | { ok: false; error: string };
const FAILED: WriteResult = { ok: false, error: "That did not save. Please try again." };
const SIGN_IN: WriteResult = { ok: false, error: "Sign in to keep your Me page." };

async function signedIn(): Promise<{ db: SupabaseClient; uid: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { db: supabase as unknown as SupabaseClient, uid: user.id };
}

export async function writeTargets(t: MeTargets): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const { error } = await s.db.from("me_targets").upsert(
    {
      user_id: s.uid,
      sex: t.sex,
      age_years: t.age,
      height_cm: t.heightCm,
      weight_kg: t.weightKg,
      units: t.units,
      activity: t.activity,
      goal: t.goal,
      pace_kg: t.paceKg,
      kcal: t.kcal,
      protein_g: t.proteinG,
      carbs_g: t.carbsG,
      fat_g: t.fatG,
    },
    { onConflict: "user_id" },
  );
  return error ? FAILED : { ok: true };
}

export type NewFood = {
  date: string;
  meal: Meal;
  recipeId: string | null;
  name: string;
  servings: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sodiumMg: number | null;
};

export async function writeFood(f: NewFood): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const { error } = await s.db.from("me_food_log").insert({
    user_id: s.uid,
    log_date: f.date,
    meal: f.meal,
    recipe_id: f.recipeId,
    name: f.name,
    servings: f.servings,
    calories: f.calories,
    protein_g: f.proteinG,
    carbs_g: f.carbsG,
    fat_g: f.fatG,
    fiber_g: f.fiberG,
    sodium_mg: f.sodiumMg,
  });
  if (error) return error.code === "54000" ? { ok: false, error: "That is a lot of entries for one day. Remove one first." } : FAILED;
  return { ok: true };
}

/** Counts the rows actually removed: a delete that matched nothing is a failure, not a success. */
export async function removeFood(id: string): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const { data, error } = await s.db.from("me_food_log").delete().eq("id", id).select("id");
  return error || !data || data.length === 0 ? FAILED : { ok: true };
}

export async function writeWorkout(w: {
  date: string;
  session: string;
  customName: string | null;
  minutes: number | null;
  muscles: { muscle: string; sets: number }[];
}): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const { error } = await s.db.rpc("me_log_workout", {
    p_date: w.date,
    p_session: w.session,
    p_custom_name: w.customName,
    p_minutes: w.minutes,
    p_muscles: w.muscles.map((m) => ({ m: m.muscle, s: m.sets })),
  });
  if (error) return error.code === "54000" ? { ok: false, error: "That is a lot of workouts for one day." } : FAILED;
  return { ok: true };
}

export async function removeWorkout(id: string): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const { data, error } = await s.db.from("me_workouts").delete().eq("id", id).select("id");
  return error || !data || data.length === 0 ? FAILED : { ok: true };
}

export async function writeSleep(date: string, hours: number): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const { error } = await s.db.from("me_sleep").upsert({ user_id: s.uid, log_date: date, hours }, { onConflict: "user_id,log_date" });
  return error ? FAILED : { ok: true };
}

export async function removeSleep(date: string): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const { data, error } = await s.db.from("me_sleep").delete().eq("log_date", date).select("log_date");
  return error || !data || data.length === 0 ? FAILED : { ok: true };
}

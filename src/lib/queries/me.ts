/*
 * Database access for the Me dashboard. Every call goes through the request-scoped, cookie-carrying client,
 * so Row Level Security is the real gate: a person can only ever read or write their own rows. Nothing here
 * may be called from a cached (ISR) page.
 */


import { photoPublicUrl, usableImageUrl } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDateOf, weekRange } from "@/lib/me/dates";
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
import { CHECKIN_KINDS, type CheckInKind } from "@/lib/me/checkin";
import type { WeightPoint } from "@/lib/me/weight";

type Db = Awaited<ReturnType<typeof createClient>>;

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
  goal_weight_kg: number | string | null;
  updated_at: string;
};

/** `zone` is the person's IANA time zone, so `updatedOn` is the LOCAL date the targets were saved. */
export async function getTargets(zone?: string | null): Promise<MeTargets | null> {
  const db = await createClient();
  const { data } = await db
    .from("me_targets")
    .select("sex, age_years, height_cm, weight_kg, units, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g, goal_weight_kg, updated_at")
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
    goalWeightKg: numOrNull(r.goal_weight_kg),
    updatedOn: localDateOf(r.updated_at, zone),
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
  nutrients: Record<string, unknown> | null;
  recipes: LoggedRecipe | LoggedRecipe[] | null;
};

/** The jsonb snapshot, keeping only finite numbers: anything else in it is ignored, never trusted. */
function snapshotOf(v: Record<string, unknown> | null): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) {
    const n = typeof x === "number" ? x : Number(x);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

type PhotoRow = { storage_path: string; thumb_path: string | null };
type LoggedRecipe = { slug: string; image_url: string | null; recipe_photos: PhotoRow | PhotoRow[] | null };

/** The photo the cards show (uploaded photo first, then the legacy URL), or null. */
function recipeThumb(imageUrl: string | null, photos: PhotoRow | PhotoRow[] | null | undefined): string | null {
  const p = Array.isArray(photos) ? photos[0] : photos;
  return p ? photoPublicUrl(p.thumb_path ?? p.storage_path) : usableImageUrl(imageUrl);
}

export async function getFoodForDate(date: string): Promise<FoodEntry[]> {
  const db = await createClient();
  const { data } = await db
    .from("me_food_log")
    .select("id, meal, name, servings, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, nutrients, recipes(slug, image_url, recipe_photos(storage_path, thumb_path))")
    .eq("log_date", date)
    .order("created_at", { ascending: true })
    .limit(80);
  // `nutrients` is new (migration 20261017150000); the generated types learn it at the next pnpm db:types.
  return ((data ?? []) as unknown as FoodRow[]).map((r) => {
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
      nutrients: snapshotOf(r.nutrients),
      recipe: rec ? { slug: rec.slug, imageUrl: recipeThumb(rec.image_url, rec.recipe_photos) } : null,
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
  const db = await createClient();
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
  const db = await createClient();
  const { data } = await db.from("me_sleep").select("hours").eq("log_date", date).maybeSingle();
  return data ? numOrNull((data as { hours: number | string }).hours) : null;
}

export async function getWeightForDate(date: string): Promise<number | null> {
  const db = await createClient();
  const { data } = await db.from("me_weights").select("weight_kg").eq("log_date", date).maybeSingle();
  return data ? numOrNull((data as { weight_kg: number | string }).weight_kg) : null;
}

export async function getDayDetail(date: string): Promise<DayDetail> {
  const [food, workouts, sleep, weightKg] = await Promise.all([
    getFoodForDate(date),
    getWorkoutsForDate(date),
    getSleepForDate(date),
    getWeightForDate(date),
  ]);
  return { date, food, workouts, sleep, weightKg, totals: sumFood(food) };
}

// ---------- weight, streaks, check-ins ----------

/** Weigh-ins from `from` to `to` (inclusive), oldest first. Bounded: at most 400 rows. */
export async function getWeights(from: string, to: string): Promise<WeightPoint[]> {
  const db = await createClient();
  const { data } = await db
    .from("me_weights")
    .select("log_date, weight_kg")
    .gte("log_date", from)
    .lte("log_date", to)
    .order("log_date", { ascending: true })
    .limit(400);
  return ((data ?? []) as { log_date: string; weight_kg: number | string }[]).map((r) => ({ date: r.log_date, kg: num(r.weight_kg) }));
}

/** Days with at least one entry of each kind over the last 400 days (the streak counters work from this). */
export async function getLoggedDays(today: string): Promise<{ kind: string; date: string }[]> {
  const db = await createClient();
  const { data } = await db.rpc("me_logged_days", { p_from: addDays(today, -399), p_to: today });
  return ((data ?? []) as { kind: string; log_date: string }[]).map((r) => ({ kind: r.kind, date: r.log_date }));
}

export async function getDismissedCheckIns(): Promise<Partial<Record<CheckInKind, string>>> {
  const db = await createClient();
  const { data } = await db.from("me_checkin_dismissals").select("kind, log_date").limit(10);
  const out: Partial<Record<CheckInKind, string>> = {};
  for (const r of (data ?? []) as { kind: string; log_date: string }[]) {
    if (CHECKIN_KINDS.includes(r.kind)) out[r.kind as CheckInKind] = r.log_date;
  }
  return out;
}

// ---------- week and month ----------

export async function getWeekMuscles(date: string): Promise<{ from: string; to: string; muscles: WeekMuscle[] }> {
  const { from, to } = weekRange(date);
  const db = await createClient();
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
  weight_kg: number | string | null;
};

export async function getMonthSummary(from: string, to: string): Promise<DaySummary[]> {
  const db = await createClient();
  const { data } = await db.rpc("me_month_summary", { p_from: from, p_to: to });
  return ((data ?? []) as SummaryRow[]).map((r) => ({
    date: r.log_date,
    calories: num(r.calories),
    proteinG: num(r.protein_g),
    foodEntries: r.food_entries ?? 0,
    trained: r.trained ?? [],
    sets: r.sets ?? 0,
    sleepHours: numOrNull(r.sleep_hours),
    weightKg: numOrNull(r.weight_kg),
  }));
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
  recipe_photos: PhotoRow | PhotoRow[] | null;
};

/** Escapes LIKE wildcards so a search for "100%" is a literal search. */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function findRecipesToLog(query: string, limit = 8): Promise<LoggableRecipe[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];
  const db = await createClient();
  const { data } = await db
    .from("recipes")
    .select("id, slug, title, servings, calories, image_url, recipe_photos(storage_path, thumb_path)")
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
    imageUrl: recipeThumb(r.image_url, r.recipe_photos),
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
  const db = await createClient();
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

async function signedIn(): Promise<{ db: Db; uid: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { db: supabase, uid: user.id };
}

export async function writeTargets(t: Omit<MeTargets, "updatedOn">): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const db = s.db;
  const { error } = await db.from("me_targets").upsert(
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
      goal_weight_kg: t.goalWeightKg,
    },
    { onConflict: "user_id" },
  );
  if (error) return FAILED;
  // New targets answer every "update your targets?" card, so any "not now" is cleared. Best effort: a
  // failure here only means a card may come back sooner.
  await db.from("me_checkin_dismissals").delete().eq("user_id", s.uid);
  return { ok: true };
}

export async function writeWeight(date: string, kg: number): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const db = s.db;
  const { error } = await db.from("me_weights").upsert({ user_id: s.uid, log_date: date, weight_kg: kg }, { onConflict: "user_id,log_date" });
  return error ? FAILED : { ok: true };
}

export async function removeWeight(date: string): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const db = s.db;
  const { data, error } = await db.from("me_weights").delete().eq("log_date", date).select("log_date");
  return error || !data || data.length === 0 ? FAILED : { ok: true };
}

export async function writeDismissal(kind: CheckInKind, date: string): Promise<WriteResult> {
  const s = await signedIn();
  if (!s) return SIGN_IN;
  const db = s.db;
  const { error } = await db.from("me_checkin_dismissals").upsert({ user_id: s.uid, kind, log_date: date }, { onConflict: "user_id,kind" });
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
  /** Per-nutrient totals for the entry, keyed by nutrient `key`; null when nothing is known beyond the columns. */
  nutrients?: Record<string, number> | null;
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
    nutrients: f.nutrients ?? null,
    // `nutrients` is new (migration 20261017150000); drop this cast after the next pnpm db:types.
  } as never);
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
    // Generated types mark these non-null (no SQL default); the function accepts NULL.
    p_custom_name: w.customName as string,
    p_minutes: w.minutes as number,
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

// ---------- export ("Download my data") ----------

/**
 * Everything the Me page stores about the signed-in person, for /api/me/export. Raw columns, snake_case, no
 * internal ids except the entry ids. RLS limits every table to the caller's own rows; the explicit ceiling
 * is far above any real diary and exists so a runaway account cannot build an unbounded response.
 */
export async function getMyHealthExport() {
  const db = await createClient();
  const cap = 20000;
  const wdb = await createClient();
  const [targets, food, workouts, sleep, weights] = await Promise.all([
    wdb
      .from("me_targets")
      .select("sex, age_years, height_cm, weight_kg, units, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g, goal_weight_kg, updated_at")
      .maybeSingle(),
    db
      .from("me_food_log")
      .select("log_date, meal, name, servings, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, created_at, recipes(slug)")
      .order("log_date", { ascending: true })
      .limit(cap),
    db
      .from("me_workouts")
      .select("log_date, session, custom_name, minutes, sets, created_at, me_workout_muscles(muscle, sets)")
      .order("log_date", { ascending: true })
      .limit(cap),
    db.from("me_sleep").select("log_date, hours").order("log_date", { ascending: true }).limit(cap),
    wdb.from("me_weights").select("log_date, weight_kg").order("log_date", { ascending: true }).limit(cap),
  ]);
  return {
    targets: targets.data ?? null,
    food_log: (food.data ?? []).map((r) => {
      const { recipes: recipe, ...rest } = r as typeof r & { recipes?: { slug: string } | { slug: string }[] | null };
      const slug = Array.isArray(recipe) ? recipe[0]?.slug : recipe?.slug;
      return { ...rest, recipe_slug: slug ?? null };
    }),
    workouts: (workouts.data ?? []).map((w) => {
      const { me_workout_muscles, ...rest } = w as typeof w & { me_workout_muscles?: { muscle: string; sets: number }[] | null };
      return { ...rest, muscles: me_workout_muscles ?? [] };
    }),
    sleep: sleep.data ?? [],
    weights: weights.data ?? [],
  };
}

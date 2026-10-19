import type { SupabaseClient } from "@supabase/supabase-js";

import { toNutrient, type Nutrient, type NutrientRow } from "@/lib/nutrients";
import { toFoodHit, type FoodHit } from "@/lib/foodHit";
import { toForms, type FoodForm } from "@/lib/foodForm";
import { getNutrients } from "@/lib/queries/recipeNutrients";
import { createStaticClient } from "@/lib/supabase/static";

export { tidyLabel, toFoodHit, type FoodHit } from "@/lib/foodHit";

/*
 * Food search for the type-ahead (recipe form ingredient line, Me "Add food") and the /lab/foods QA page.
 *
 * Contract with the schema lane (docs/research/wave10-micronutrients-plan.md section 3.1 plus the wave 10
 * task): canonical ingredients (`ingredients`), the USDA foods linked to them (`ingredient_foods`,
 * `usda_foods`, brands included), and an RPC `search_foods` that returns canonical ingredients first, then
 * foods and brands. This module reads the RPC rows defensively (names of columns are matched, not
 * positions) and, when the RPC is not there yet, falls back to the existing `suggest_ingredients` RPC so
 * the box still completes ingredient names. The fallback cannot say whether an ingredient has nutrition
 * data, so `hasNutrition` is null ("unknown") there and the UI says nothing rather than guess.
 *
 * Domain rule kept: a brand is a FOOD linked to one canonical ingredient. A hit with `fdcId` always
 * carries the `ingredientId` it belongs to, so a recipe line still resolves to a canonical row.
 */

const loose = (): SupabaseClient => createStaticClient() as unknown as SupabaseClient;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Argument-name styles the RPC could have been written with; the first one the database accepts is remembered. */
const ARG_STYLES: ((q: string, n: number) => Raw)[] = [
  (q, n) => ({ prefix: q, max_results: n }),
  (q, n) => ({ q, max_results: n }),
  (q, n) => ({ p_query: q, p_limit: n }),
  (q, n) => ({ query: q, max_results: n }),
];
let argStyle = -1;
let rpcMissing = false;

async function viaSearchFoods(sb: SupabaseClient, q: string, limit: number): Promise<FoodHit[] | null> {
  if (rpcMissing) return null;
  const order = argStyle >= 0 ? [argStyle] : ARG_STYLES.map((_, i) => i);
  for (const i of order) {
    const { data, error } = await sb.rpc("search_foods", ARG_STYLES[i](q, limit));
    if (!error) {
      argStyle = i;
      return ((data ?? []) as Raw[]).flatMap((r) => {
        const h = toFoodHit(r);
        return h ? [h] : [];
      });
    }
    // PGRST202: no function with that name and argument names. 42883: no such function at all.
    if (error.code !== "PGRST202" && error.code !== "42883") return null;
  }
  rpcMissing = true; // do not retry on every keystroke until the process restarts
  return null;
}

async function viaSuggest(sb: SupabaseClient, q: string, limit: number): Promise<FoodHit[]> {
  const { data, error } = await sb.rpc("suggest_ingredients", { prefix: q, max_results: limit });
  if (error) throw new Error(`suggest_ingredients: ${error.message}`);
  const seen = new Set<number>();
  const out: FoodHit[] = [];
  for (const r of (data ?? []) as Raw[]) {
    const id = numOrNull(r.ingredient_id);
    const name = str(r.canonical_name);
    if (id === null || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ kind: "ingredient", ingredientId: id, fdcId: null, label: name, canonicalName: name, brand: null, serving: null, kcalPer100g: null, hasNutrition: null });
  }
  return out;
}

/**
 * Suggestions for what a person is typing. Canonical ingredients first, then foods and brands; at most
 * `limit`. Throws on a database fault so the caller can show "search did not work" instead of an empty list.
 */
export async function searchFoods(q: string, limit = 10): Promise<FoodHit[]> {
  const clean = q.replace(/\s+/g, " ").trim().slice(0, 60);
  if (clean.length < 2) return [];
  const sb = loose();
  const hits = (await viaSearchFoods(sb, clean, limit)) ?? (await viaSuggest(sb, clean, limit));
  // Defensive order: ingredients before foods, whatever the RPC returned; the RPC's own rank decides inside each kind.
  const rank = (h: FoodHit) => (h.kind === "ingredient" ? 0 : 1);
  return hits
    .map((h, i) => ({ h, i }))
    .sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i)
    .map((x) => x.h)
    .slice(0, limit);
}

// ------------------------------------------------------- one food, one amount

export type FoodLine = {
  ingredientId: number;
  /** A specific food or brand; null means the ingredient's default food. */
  fdcId: number | null;
  quantity: number;
  /** Unit as a person types it ("g", "cup"); empty means "each". Resolved by resolve_unit(). */
  unit: string;
};

export type ComputedFood = {
  /** Totals for the whole amount, by nutrient. Only nutrients that are reported. */
  rows: { nutrient: Nutrient; amount: number }[];
  /** The same, keyed by nutrient `key`, for freezing onto a diary row. */
  byKey: Record<string, number>;
};

export type ComputeFailure = "unavailable" | "unit" | "no_data";

/**
 * What a given amount of one food adds up to, using compute_nutrients() (the same function that prices a
 * recipe, so the diary and the recipe page cannot disagree). Never guesses: when the ingredient has no
 * food, or the unit has no gram weight for it, the answer is "no_data".
 */
export async function computeFood(line: FoodLine): Promise<{ ok: true; food: ComputedFood } | { ok: false; reason: ComputeFailure }> {
  const sb = loose();
  let unitId: number | null = null;
  if (line.unit.trim() !== "") {
    const u = await sb.rpc("resolve_unit", { raw_unit: line.unit.trim() });
    if (u.error) return { ok: false, reason: "unavailable" };
    unitId = numOrNull(((u.data ?? []) as Raw[])[0]?.unit_id);
    if (unitId === null) return { ok: false, reason: "unit" };
  }
  const lines = [
    { ingredient_id: line.ingredientId, fdc_id: line.fdcId, quantity: line.quantity, unit_id: unitId, prep_note: null, is_optional: false },
  ];
  const [res, nutrients] = await Promise.all([sb.rpc("compute_nutrients", { lines, servings: 1 }), getNutrients()]);
  if (res.error) return { ok: false, reason: "unavailable" };
  const byId = new Map(nutrients.map((n) => [n.id, n]));
  const rows: ComputedFood["rows"] = [];
  const byKey: Record<string, number> = {};
  for (const r of (res.data ?? []) as Raw[]) {
    const id = numOrNull(r.nutrient_id);
    const amount = numOrNull(r.amount_per_serving ?? r.amount);
    const n = id === null ? undefined : byId.get(id);
    if (!n || amount === null || amount < 0) continue;
    const coverage = numOrNull(r.coverage);
    if (coverage !== null && coverage <= 0) continue; // nothing reported it: not zero, just unknown
    rows.push({ nutrient: n, amount });
    byKey[n.key] = amount;
  }
  if (rows.length === 0) return { ok: false, reason: "no_data" };
  return { ok: true, food: { rows, byKey } };
}

// ------------------------------------------------------------ QA page reads

export type FoodDetail = {
  fdcId: number;
  description: string;
  dataType: string | null;
  brandOwner: string | null;
  brandName: string | null;
  servingSize: number | null;
  servingSizeUnit: string | null;
  household: string | null;
  nutrients: { nutrient: Nutrient; per100g: number }[];
};

type DetailRow = {
  fdc_id: number;
  description: string;
  data_type: string | null;
  brand_owner: string | null;
  brand_name: string | null;
  serving_size: number | string | null;
  serving_size_unit: string | null;
  household_serving: string | null;
  usda_food_nutrients: { amount_per_100g: number | string; nutrients: NutrientRow | NutrientRow[] | null }[] | null;
};

/** One USDA food with every nutrient it reports per 100 g, for /lab/foods. Null when not found or tables missing. */
export async function getFoodDetail(fdcId: number): Promise<FoodDetail | null> {
  if (!Number.isInteger(fdcId) || fdcId <= 0) return null;
  const { data, error } = await loose()
    .from("usda_foods")
    .select(
      "fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving, usda_food_nutrients(amount_per_100g, nutrients(id, key, name, unit, fdc_number, dv_amount, dv_unit, display_group, sort))",
    )
    .eq("fdc_id", fdcId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as DetailRow;
  const nutrients: FoodDetail["nutrients"] = [];
  for (const row of r.usda_food_nutrients ?? []) {
    const n = Array.isArray(row.nutrients) ? row.nutrients[0] : row.nutrients;
    if (n) nutrients.push({ nutrient: toNutrient(n), per100g: Number(row.amount_per_100g) });
  }
  nutrients.sort((a, b) => a.nutrient.sort - b.nutrient.sort);
  return {
    fdcId: r.fdc_id,
    description: r.description,
    dataType: r.data_type,
    brandOwner: r.brand_owner,
    brandName: r.brand_name,
    servingSize: numOrNull(r.serving_size),
    servingSizeUnit: r.serving_size_unit,
    household: r.household_serving,
    nutrients,
  };
}

export type FoodCounts = { foods: number | null; branded: number | null; ingredientsWithFood: number | null; ingredients: number | null };

/** Headline counts for /lab/foods. A null means the table is not there (yet). */
export async function getFoodCounts(): Promise<FoodCounts> {
  const sb = loose();
  const count = async (build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const r = await build();
      return r.error ? null : r.count;
    } catch {
      return null;
    }
  };
  const [foods, branded, links, ingredients] = await Promise.all([
    count(() => sb.from("usda_foods").select("fdc_id", { count: "exact", head: true })),
    count(() => sb.from("usda_foods").select("fdc_id", { count: "exact", head: true }).eq("data_type", "branded")),
    count(() => sb.from("ingredient_foods").select("ingredient_id", { count: "exact", head: true }).eq("is_default", true)),
    count(() => sb.from("ingredients").select("id", { count: "exact", head: true })),
  ]);
  return { foods, branded, ingredientsWithFood: links, ingredients };
}

/**
 * The distinct USDA foods an ingredient can be weighed as (raw, cooked, canned...): the default food of each
 * form. Empty when the ingredient has only one, so the dialog asks nothing it does not need to.
 */
export async function getFoodForms(ingredientId: number): Promise<FoodForm[]> {
  const { data, error } = await loose()
    .from("ingredient_foods")
    .select("form, fdc_id, is_default, usda_foods(description)")
    .eq("ingredient_id", ingredientId)
    .eq("is_default", true);
  if (error || !data) return [];
  type Row = { form: string; fdc_id: number; is_default: boolean; usda_foods: { description: string } | { description: string }[] | null };
  const forms = toForms(
    (data as unknown as Row[]).map((r) => {
      const u = Array.isArray(r.usda_foods) ? r.usda_foods[0] : r.usda_foods;
      return { form: r.form, fdcId: r.fdc_id, isDefault: r.is_default, description: u?.description ?? "" };
    }),
  );
  return forms.length > 1 ? forms : [];
}

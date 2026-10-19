import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { toNutrient, type Nutrient, type NutrientRow } from "@/lib/nutrients";
import { snapshotFromRows } from "@/lib/me/snapshot";
import { createStaticClient } from "@/lib/supabase/static";

/*
 * Reads for the nutrition tables (the schema lane's migration: nutrients, recipe_nutrients and the
 * nutrition_* columns on recipes). Both reads are written to be harmless before that data exists:
 * a missing table, an empty table or a network error returns an empty result and the page shows what it
 * showed before. The tables are not in the generated database types yet, so the client is cast.
 */

const loose = () => createStaticClient() as unknown as SupabaseClient;


// ---------------------------------------------------------------- nutrients

async function loadNutrients(): Promise<Nutrient[]> {
  const { data, error } = await loose()
    .from("nutrients")
    .select("id, key, name, unit, fdc_number, dv_amount, dv_unit, display_group, sort")
    .order("sort", { ascending: true })
    .limit(200);
  if (error) throw error; // thrown so unstable_cache does not store a failure for an hour
  return ((data ?? []) as NutrientRow[]).map(toNutrient);
}

const cachedNutrients = unstable_cache(loadNutrients, ["nutrients-v1"], { revalidate: 3600 });

/** The nutrient vocabulary (about 30 rows) with FDA Daily Values. Empty when the table is not there yet. */
export async function getNutrients(): Promise<Nutrient[]> {
  try {
    return await cachedNutrients();
  } catch {
    return [];
  }
}

// ----------------------------------------------------------- recipe values

export type NutritionStatus = "complete" | "partial" | "unavailable";
export type NutritionSource = "usda_myplate" | "computed";

export type RecipeNutrientRow = {
  nutrient: Nutrient;
  /** Per serving; null when no counted ingredient reports it. */
  amount: number | null;
  /** Share (0..1) of counted ingredient mass whose food reports this nutrient. */
  coverage: number;
};

export type RecipeNutrients = {
  status: NutritionStatus | null;
  source: NutritionSource | null;
  /** Names of ingredients that could not be counted (no food, or no gram weight). */
  gaps: string[];
  /**
   * USDA MyPlate recipes: (computed - published) / published calories. Above 0.2 in either direction the label
   * says the computed vitamins and minerals may not match the published calories. Null when not applicable.
   */
  kcalDelta?: number | null;
  rows: RecipeNutrientRow[];
};

type RnRow = {
  amount_per_serving: number | string | null;
  coverage: number | string | null;
  nutrients: NutrientRow | NutrientRow[] | null;
};

type StatusRow = {
  nutrition_status: NutritionStatus | null;
  nutrition_source: NutritionSource | null;
  nutrition_gaps: string[] | null;
  nutrition_kcal_delta?: number | string | null;
};

const asNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The computed nutrient rows for one recipe, plus its status and the ingredients that could not be
 * counted. Null when nothing is computed (tables missing, recipe not processed yet): callers then keep
 * showing only the six published macro columns.
 */
export async function getRecipeNutrients(recipeId: string): Promise<RecipeNutrients | null> {
  const sb = loose();
  try {
    const [rn, st] = await Promise.all([
      sb
        .from("recipe_nutrients")
        .select("amount_per_serving, coverage, nutrients(id, key, name, unit, fdc_number, dv_amount, dv_unit, display_group, sort)")
        .eq("recipe_id", recipeId)
        .limit(200),
      sb.from("recipes").select("nutrition_status, nutrition_source, nutrition_gaps, nutrition_kcal_delta").eq("id", recipeId).maybeSingle(),
    ]);
    if (rn.error || st.error) return null;

    const rows: RecipeNutrientRow[] = [];
    for (const r of (rn.data ?? []) as unknown as RnRow[]) {
      const n = Array.isArray(r.nutrients) ? r.nutrients[0] : r.nutrients;
      if (!n) continue;
      rows.push({ nutrient: toNutrient(n), amount: asNum(r.amount_per_serving), coverage: asNum(r.coverage) ?? 0 });
    }
    const s = (st.data ?? null) as StatusRow | null;
    if (rows.length === 0 && !s?.nutrition_status) return null;
    return {
      status: s?.nutrition_status ?? null,
      source: s?.nutrition_source ?? null,
      // a NULL or non-string element must never reach the page (it rendered a blank row)
      gaps: (s?.nutrition_gaps ?? []).filter((g): g is string => typeof g === "string" && g.trim() !== ""),
      kcalDelta: asNum(s?.nutrition_kcal_delta),
      rows,
    };
  } catch {
    return null;
  }
}

/**
 * Per-serving amounts keyed by nutrient `key`, for freezing onto a diary row. Only rows that report an
 * amount are included: an absent key means "not reported", which is not zero. Null when nothing computed.
 */
export async function getRecipeNutrientSnapshot(recipeId: string): Promise<Record<string, number> | null> {
  const data = await getRecipeNutrients(recipeId);
  if (!data || data.status === "unavailable") return null;
  return snapshotFromRows(data.rows, data.status === "partial");
}

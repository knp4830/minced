import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import type { FormOptions, MyRecipeDetail, MyRecipeRow } from "@/lib/recipeForm";
import { createClient } from "@/lib/supabase/server";
import { createStaticClient } from "@/lib/supabase/static";

/*
 * The signed-in cook's own recipes (M5). Authors have NO table privileges on
 * recipes: every read and write here is a SECURITY DEFINER RPC that takes the
 * author from auth.uid() (see 20261014120000_user_recipes.sql). The RPCs are
 * reached through a loose call signature (kept until src/types/database.ts is
 * regenerated after 20261014160000_user_recipes_hardening, which re-creates the
 * five RPCs as wrappers behind the database-side feature switch).
 */

type RpcResult = { data: unknown; error: { message: string; code?: string; hint?: string } | null };
type Rpc = { rpc(fn: string, args?: object): PromiseLike<RpcResult> };

async function rpc(fn: string, args?: object): Promise<RpcResult> {
  const supabase = (await createClient()) as unknown as Rpc;
  return supabase.rpc(fn, args);
}

export async function listMyRecipes(): Promise<MyRecipeRow[]> {
  const { data, error } = await rpc("my_recipes");
  if (error) {
    if (error.code === "42501") return [];
    throw new Error(`my_recipes: ${error.message}`);
  }
  return (data ?? []) as MyRecipeRow[];
}

/** The author's recipe by slug, or null when it is not theirs (or does not exist). */
export async function getMyRecipeBySlug(slug: string): Promise<MyRecipeDetail | null> {
  const mine = (await listMyRecipes()).find((r) => r.slug === slug);
  if (!mine) return null;
  const { data, error } = await rpc("my_recipe_for_edit", { p_recipe_id: mine.id });
  if (error) throw new Error(`my_recipe_for_edit: ${error.message}`);
  return (data ?? null) as MyRecipeDetail | null;
}

/** The specific food (a brand, say) an author picked per line, keyed by the line's position (sort_order). */
export type PickedFood = { pos: number; fdcId: number; label: string | null; brand: string | null };

/** Stores the food choices after a save. A failure is reported, not hidden: the recipe itself is already saved. */
export async function setMyRecipeFoods(recipeId: string, picks: { pos: number; fdc_id: number }[]): Promise<boolean> {
  const { error } = await rpc("set_my_recipe_foods", { p_recipe_id: recipeId, p_picks: picks });
  return !error;
}

/** Food choices saved with a recipe. Empty (never throws) when the nutrition tables are not there yet. */
export async function getMyRecipeFoods(recipeId: string): Promise<PickedFood[]> {
  const { data, error } = await rpc("my_recipe_foods", { p_recipe_id: recipeId });
  if (error || !Array.isArray(data)) return [];
  return (data as { pos: number; fdc_id: number; label: string | null; brand: string | null }[]).map((r) => ({
    pos: r.pos,
    fdcId: r.fdc_id,
    label: r.label,
    brand: r.brand,
  }));
}

export type SaveResult =
  | { ok: true; id: string; slug: string; status: "draft" | "in_review" }
  | { ok: false; reason: "signed_out" | "not_found" | "invalid" | "failed"; message?: string; field?: string };

export async function saveMyRecipe(recipeId: string | null, data: object, submit: boolean): Promise<SaveResult> {
  const res = await rpc("save_my_recipe", { p_recipe_id: recipeId, p_data: data, p_submit: submit });
  if (res.error) return mapError(res.error);
  const row = res.data as { id: string; slug: string; status: "draft" | "in_review" };
  return { ok: true, id: row.id, slug: row.slug, status: row.status };
}

export type AutosaveFailure = "signed_out" | "gone" | "not_draft" | "invalid" | "transient";
export type AutosaveSaved = { ok: true; id: string; slug: string; skipped: number };

/**
 * Draft autosave (autosave_my_recipe): only ever writes a draft, never submits, and leaves out ingredient
 * lines that are not valid yet instead of failing. `transient` is the one worth retrying.
 */
export async function autosaveMyRecipe(
  recipeId: string | null,
  data: object,
): Promise<AutosaveSaved | { ok: false; reason: AutosaveFailure; message?: string }> {
  const res = await rpc("autosave_my_recipe", { p_recipe_id: recipeId, p_data: data });
  if (res.error) {
    const e = res.error;
    if (e.code === "42501") return { ok: false, reason: "signed_out" };
    if (e.code === "P0002") return { ok: false, reason: "gone" };
    if (e.code === "22023") return { ok: false, reason: e.hint === "not_draft" ? "not_draft" : "invalid", message: e.message };
    return { ok: false, reason: "transient" };
  }
  const row = res.data as { id: string; slug: string; skipped?: number };
  return { ok: true, id: row.id, slug: row.slug, skipped: Number(row.skipped ?? 0) };
}

export type SlugResult ={ ok: true; slug: string } | Extract<SaveResult, { ok: false }>;

export async function deleteMyRecipe(recipeId: string): Promise<SlugResult> {
  const res = await rpc("delete_my_recipe", { p_recipe_id: recipeId });
  if (res.error) return mapError(res.error);
  return { ok: true, slug: String(res.data) };
}

export async function withdrawMyRecipe(recipeId: string): Promise<SlugResult> {
  const res = await rpc("withdraw_my_recipe", { p_recipe_id: recipeId });
  if (res.error) return mapError(res.error);
  return { ok: true, slug: String(res.data) };
}

function mapError(error: { message: string; code?: string; hint?: string }): Extract<SaveResult, { ok: false }> {
  if (error.code === "42501") return { ok: false, reason: "signed_out" };
  if (error.code === "P0002") return { ok: false, reason: "not_found" };
  // 22023 messages are written for people (see the migration); anything else is a fault.
  if (error.code === "22023") return { ok: false, reason: "invalid", message: error.message, field: error.hint || undefined };
  return { ok: false, reason: "failed" };
}

/** What a typed name resolves to, for the inline check. null when nothing matches. */
export async function resolveIngredientName(name: string): Promise<string | null> {
  const { data, error } = await rpc("resolve_ingredient", { raw_name: name });
  if (error) throw new Error(`resolve_ingredient: ${error.message}`);
  const rows = (data ?? []) as { canonical_name: string }[];
  return rows[0]?.canonical_name ?? null;
}

async function loadFormOptions(): Promise<FormOptions> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const [cuisines, diets, cookware, units] = await Promise.all([
    sb.from("cuisines").select("id, name").order("name"),
    sb.from("diets").select("id, name").order("id"),
    sb.from("cookware").select("id, name").order("name"),
    sb.from("units").select("name, kind").order("kind").order("name"),
  ]);
  for (const r of [cuisines, diets, cookware, units]) {
    if (r.error) throw r.error;
  }
  return {
    cuisines: (cuisines.data ?? []) as FormOptions["cuisines"],
    diets: (diets.data ?? []) as FormOptions["diets"],
    cookware: (cookware.data ?? []) as FormOptions["cookware"],
    units: ((units.data ?? []) as { name: string }[]).map((u) => u.name),
  };
}

/** Vocabularies change only on import: cached for an hour with the cookie-free client. */
export const getFormOptions = unstable_cache(loadFormOptions, ["recipe-form-options-v2"], { revalidate: 3600 });

// ---------------------------------------------------------------------------
// Live nutrition preview for the recipe form
// ---------------------------------------------------------------------------

/** One ingredient line as the form holds it, already parsed. `name` is what the person typed. */
export type PreviewLine = {
  name: string;
  quantity: number | null;
  unit: string;
  note: string;
  optional: boolean;
  fdcId: number | null;
  /** The amount box holds something that is not a number; the line cannot be counted until it is fixed. */
  badAmount?: boolean;
};

export type PreviewMacro = { key: "energy_kcal" | "protein_g" | "carbs_g" | "fat_g"; amount: number; atLeast: boolean };

export type PreviewUncounted = {
  name: string;
  /** Why it is not in the numbers, in words a cook can act on. */
  reason: string;
};

export type NutritionPreview = {
  /**
   * empty: no ingredient line yet; unavailable: fewer than half of the lines could be counted, so no number is
   * stated; partial: numbers are "at least"; complete: every line that needs an amount is in the numbers.
   */
  status: "empty" | "unavailable" | "partial" | "complete";
  macros: PreviewMacro[];
  uncounted: PreviewUncounted[];
};

const MACRO_KEYS = ["energy_kcal", "protein_g", "carbs_g", "fat_g"] as const;
/** A nutrient is stated as a plain number only when this share of the counted mass reports it (same bar as the recipe label). */
const PREVIEW_MIN_COVERAGE = 0.9;

function gapReason(gap: string): PreviewUncounted {
  // Database gaps read "pasta (no amount given)"; the reason is the last bracket, which may hold a nested one.
  const m = /^(.*?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)$/.exec(gap.trim());
  if (!m) return { name: gap.trim(), reason: "no nutrition data for it yet" };
  const reason = m[2]
    .replace(/^no USDA food linked$/i, "no nutrition data for it yet")
    .replace(/^food has no nutrient data$/i, "no nutrition data for it yet")
    .replace(/^chosen food is not linked to this ingredient$/i, "that food is not linked to this ingredient")
    .replace(/^unknown ingredient or unit$/i, "not recognised");
  return { name: m[1], reason };
}

/**
 * What the lines on the form add up to, per serving, using the same database functions that price a published
 * recipe (nutrition_summary + compute_nutrients), so the preview and the recipe page cannot disagree.
 *
 * Never guesses. A name or unit the database does not know is listed as not counted, and any list with a
 * not-counted line makes every number "at least". Nothing is written.
 */
export async function previewNutrition(lines: PreviewLine[], servings: number): Promise<NutritionPreview> {
  const named = lines.filter((l) => l.name.trim() !== "");
  if (named.length === 0) return { status: "empty", macros: [], uncounted: [] };

  const uncounted: PreviewUncounted[] = [];
  const names = [...new Set(named.map((l) => l.name.trim().toLowerCase()))];
  const units = [...new Set(named.map((l) => l.unit.trim().toLowerCase()).filter((u) => u !== ""))];

  const [nameRes, unitRes] = await Promise.all([
    Promise.all(names.map((n) => rpc("resolve_ingredient", { raw_name: n }))),
    Promise.all(units.map((u) => rpc("resolve_unit", { raw_unit: u }))),
  ]);
  const ingId = new Map<string, number | null>();
  names.forEach((n, i) => {
    const r = nameRes[i];
    if (r.error) throw new Error(`resolve_ingredient: ${r.error.message}`);
    ingId.set(n, ((r.data ?? []) as { ingredient_id: number }[])[0]?.ingredient_id ?? null);
  });
  const unitId = new Map<string, number | null>();
  units.forEach((u, i) => {
    const r = unitRes[i];
    if (r.error) throw new Error(`resolve_unit: ${r.error.message}`);
    unitId.set(u, ((r.data ?? []) as { unit_id: number }[])[0]?.unit_id ?? null);
  });

  const payload: object[] = [];
  let unresolvedRequired = 0;
  for (const l of named) {
    const id = ingId.get(l.name.trim().toLowerCase()) ?? null;
    const unitKey = l.unit.trim().toLowerCase();
    let reason: string | null = null;
    if (l.badAmount) reason = "the amount is not a number";
    else if (id === null) reason = "not recognised yet";
    // Treating an unknown unit as "each" would put a wrong weight into the numbers.
    else if (unitKey !== "" && (unitId.get(unitKey) ?? null) === null) reason = `unit "${l.unit.trim()}" not recognised`;
    if (reason !== null) {
      uncounted.push({ name: l.name.trim(), reason });
      if (!l.optional) unresolvedRequired++;
    } else {
      payload.push({
        ingredient_id: id,
        fdc_id: l.fdcId,
        quantity: l.quantity,
        unit_id: unitKey === "" ? null : unitId.get(unitKey),
        prep_note: l.note.trim() === "" ? null : l.note.trim(),
        is_optional: l.optional,
      });
    }
  }

  if (payload.length === 0) return { status: "unavailable", macros: [], uncounted };

  const [sum, comp] = await Promise.all([
    rpc("nutrition_summary", { lines: payload }),
    rpc("compute_nutrients", { lines: payload, servings }),
  ]);
  if (sum.error) throw new Error(`nutrition_summary: ${sum.error.message}`);
  if (comp.error) throw new Error(`compute_nutrients: ${comp.error.message}`);

  const s = ((sum.data ?? []) as { quantified_lines: number; counted_lines: number; gaps: string[] | null; optional_lines: string[] | null; to_taste: string[] | null }[])[0];
  for (const g of s?.gaps ?? []) uncounted.push(gapReason(g));
  for (const o of s?.optional_lines ?? []) uncounted.push({ name: o, reason: "optional, left out" });
  for (const t of s?.to_taste ?? []) uncounted.push({ name: t, reason: "to taste, counted as none" });

  // Same bar as the recipe page: fewer than half of the lines that need an amount counted means no number.
  const needing = (s?.quantified_lines ?? 0) + unresolvedRequired;
  const counted = s?.counted_lines ?? 0;
  if (!s || needing === 0 || counted * 2 < needing) return { status: "unavailable", macros: [], uncounted };
  const status: NutritionPreview["status"] = counted === needing ? "complete" : "partial";

  const rows = (comp.data ?? []) as { nutrient_key: string; amount_per_serving: number | string; coverage: number | string }[];
  const macros: PreviewMacro[] = [];
  for (const key of MACRO_KEYS) {
    const r = rows.find((x) => x.nutrient_key === key);
    if (!r) continue; // no counted ingredient reports it: not zero, just unknown
    const amount = Number(r.amount_per_serving);
    if (!Number.isFinite(amount) || amount < 0) continue;
    macros.push({ key, amount, atLeast: status !== "complete" || Number(r.coverage) < PREVIEW_MIN_COVERAGE });
  }
  return { status, macros, uncounted };
}

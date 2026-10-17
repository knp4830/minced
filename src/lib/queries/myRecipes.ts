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

export type SlugResult = { ok: true; slug: string } | Extract<SaveResult, { ok: false }>;

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

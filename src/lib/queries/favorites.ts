import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeCardProps } from "@/components/recipe/recipeCard";
import { getCardExtras } from "@/lib/queries/browse";
import { createClient } from "@/lib/supabase/server";

/*
 * Favourites are private: RLS lets a user see and change only their own rows
 * (policies in 20260828021933_rls_policies.sql), so these use the cookie-bound
 * client. Recipes are addressed by slug at the edge (the browser only knows
 * slugs) and by id in the table.
 */

type FavRow = { created_at: string; recipes: { id: string; slug: string } | null };

async function listFavorites(): Promise<{ id: string; slug: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("created_at, recipes(id, slug)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as FavRow[]).flatMap((r) => (r.recipes ? [r.recipes] : []));
}

/** Slugs the signed-in user has saved. Empty for signed-out callers (RLS returns no rows). */
export async function getFavoriteSlugs(): Promise<string[]> {
  return (await listFavorites()).map((r) => r.slug);
}

/** Saved recipes as cards, newest save first. */
export async function getFavoriteCards(): Promise<RecipeCardProps[]> {
  const rows = await listFavorites();
  const extras = await getCardExtras(rows.map((r) => r.id));
  return rows.flatMap((r) => {
    const card = extras[r.id];
    return card ? [card] : [];
  });
}

export type FavoriteResult =
  | { ok: true }
  | { ok: false; reason: "signed-out" | "not-found" | "failed" };

/** Save (`on`) or unsave a recipe for the caller. Idempotent both ways. */
export async function setFavorite(slug: string, on: boolean): Promise<FavoriteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const { data: recipe } = await (supabase as unknown as SupabaseClient)
    .from("recipes")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const recipeId = (recipe as { id: string } | null)?.id;
  if (!recipeId) return { ok: false, reason: "not-found" };

  if (on) {
    // INSERT ... ON CONFLICT DO NOTHING, so a double tap is not an error.
    const { error } = await supabase
      .from("favorites")
      .upsert(
        { user_id: user.id, recipe_id: recipeId },
        { onConflict: "user_id,recipe_id", ignoreDuplicates: true },
      );
    return error ? { ok: false, reason: "failed" } : { ok: true };
  }
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("recipe_id", recipeId);
  return error ? { ok: false, reason: "failed" } : { ok: true };
}

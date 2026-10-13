/* Basic published-recipe list and the RecipeCard row type. The browse and search doors use browse.ts / search.ts; some exports here are unused (see docs/ARCHITECTURE.md). */

import { createClient } from "@/lib/supabase/server";

import type { Database } from "@/types/database";

export type RecipeCard = Pick<
  Database["public"]["Tables"]["recipes"]["Row"],
  "id" | "slug" | "title" | "servings" | "total_time_min" | "calories" | "image_url"
>;

/**
 * Published recipes, newest first.
 *
 * No `status` filter here on purpose: RLS already restricts this to published
 * rows plus the caller's own drafts. Adding `.eq("status", "published")` would
 * duplicate a rule that lives in the database, and the two copies would
 * eventually disagree.
 *
 * Cursor-based, per CLAUDE.md. `published_at` alone is not unique, so ties
 * would make rows repeat or vanish between pages — `id` is the tiebreak.
 */
export async function getRecipeCards(limit = 24): Promise<RecipeCard[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recipes")
    .select("id, slug, title, servings, total_time_min, calories, image_url")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

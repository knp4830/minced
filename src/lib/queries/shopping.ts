import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShopLine, UnitKind } from "@/lib/shopping";
import { createClient } from "@/lib/supabase/server";

/*
 * Shopping list queries. Private data: RLS (20261013150000_shopping_list.sql)
 * lets a user see and change only their own rows, so these use the
 * cookie-bound client and need no user_id filter. Writes that name a user go
 * through database functions that read auth.uid(), never a value from here.
 *
 * `shopping_list_items` is not in the generated types until the next
 * `pnpm db:types` (done at integration), so the client is widened here.
 */

type Row = {
  id: number;
  quantity: number | null;
  checked: boolean;
  ingredients: { id: number; canonical_name: string; aisle_category: string } | null;
  units: { name: string; kind: UnitKind; to_base_factor: number | null } | null;
  recipes: { slug: string; title: string } | null;
};

const SELECT =
  "id, quantity, checked, ingredients(id, canonical_name, aisle_category), units(name, kind, to_base_factor), recipes(slug, title)";

async function db(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

/** The caller's raw lines, oldest first. Empty for signed-out callers (RLS returns no rows). */
export async function getShoppingLines(): Promise<ShopLine[]> {
  const sb = await db();
  const { data, error } = await sb
    .from("shopping_list_items")
    .select(SELECT)
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).flatMap((r): ShopLine[] =>
    r.ingredients
      ? [
          {
            key: String(r.id),
            ingredientId: r.ingredients.id,
            name: r.ingredients.canonical_name,
            aisle: r.ingredients.aisle_category,
            quantity: r.quantity,
            unit: r.units?.name ?? null,
            unitKind: r.units?.kind ?? null,
            unitFactor: r.units?.to_base_factor ?? null,
            recipeSlug: r.recipes?.slug ?? null,
            recipeTitle: r.recipes?.title ?? null,
            checked: r.checked,
          },
        ]
      : [],
  );
}

export type AddResult =
  | { ok: true; added: number; skippedStaples: number; skippedHave: string[] }
  | { ok: false; reason: "signed-out" | "not-found" | "full" | "failed" };

export async function addRecipe(
  slug: string,
  servings: number,
  skipStaples: boolean,
  haveIds: number[],
): Promise<AddResult> {
  const sb = await db();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const { data: recipe } = await sb.from("recipes").select("id").eq("slug", slug).maybeSingle();
  const id = (recipe as { id: string } | null)?.id;
  if (!id) return { ok: false, reason: "not-found" };

  const { data, error } = await sb.rpc("add_recipe_to_shopping_list", {
    p_recipe_id: id,
    p_servings: servings,
    p_skip_staples: skipStaples,
    p_have_ids: haveIds,
  });
  if (error) return { ok: false, reason: error.code === "54000" ? "full" : "failed" };
  const r = data as { added: number; skipped_staples: number; skipped_have: string[] };
  return { ok: true, added: r.added, skippedStaples: r.skipped_staples, skippedHave: r.skipped_have };
}

/** Tick or untick raw lines. The column grant means `checked` is the only thing this can change. */
export async function setChecked(ids: number[], checked: boolean): Promise<boolean> {
  const sb = await db();
  const { error } = await sb.from("shopping_list_items").update({ checked }).in("id", ids);
  return !error;
}

/** Delete specific raw lines (RLS limits this to the caller's own). */
export async function removeByIds(ids: number[]): Promise<boolean> {
  const sb = await db();
  const { error } = await sb.from("shopping_list_items").delete().in("id", ids);
  return !error;
}

export async function clearChecked(): Promise<boolean> {
  const sb = await db();
  const { error } = await sb.from("shopping_list_items").delete().eq("checked", true);
  return !error;
}

export async function clearAll(): Promise<boolean> {
  const sb = await db();
  // PostgREST refuses an unfiltered delete; RLS already limits it to the caller's rows.
  const { error } = await sb.from("shopping_list_items").delete().gt("id", 0);
  return !error;
}

/** Hand the signed-out list to the account. Returns the number of lines kept, or null on failure. */
export async function importLocal(items: unknown[]): Promise<number | null> {
  const sb = await db();
  const { data, error } = await sb.rpc("import_local_shopping_list", { p_items: items });
  if (error) return null;
  return typeof data === "number" ? data : 0;
}

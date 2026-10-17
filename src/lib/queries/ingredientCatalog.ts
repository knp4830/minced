import { unstable_cache } from "next/cache";
import { createStaticClient } from "@/lib/supabase/static";

/** One tappable ingredient in the fridge picker. */
export type CatalogItem = {
  id: number;
  name: string;
  /** Recipes that call for it (family variants folded into the parent). */
  uses: number;
  /**
   * Lower-cased synonyms the find box also matches ("green onion" for scallion),
   * joined with "|" to keep the page payload small. Includes the names and
   * aliases of family variants folded into this item. Omitted when there are none.
   */
  aka?: string;
};

export type CatalogCategory = { name: string; items: CatalogItem[] };

export type IngredientCatalog = {
  categories: CatalogCategory[];
};

/** Tab order. Anything the database adds later lands in "Other". */
const CATEGORY_ORDER = ["Produce", "Protein", "Dairy", "Pantry", "Spices"] as const;

type CatalogRow = {
  id: number;
  canonical_name: string;
  aisle_category: string;
  is_pantry_staple: boolean;
  family_id: number | null;
  recipe_ingredients: { count: number }[];
  ingredient_aliases: { alias: string }[];
};

/**
 * Everything a cook can tap in the fridge picker, grouped by aisle.
 *
 * - **Family parents only.** "yellow onion" folds into "onion": match_recipes
 *   already treats a parent in the pantry as covering its variants, so offering
 *   both would be two taps for one answer. A variant's usage is added to its
 *   parent so "onion" sorts where cooks actually meet it.
 * - **No pantry staples** (salt, oil, butter...): they never count as missing,
 *   so picking them would change nothing.
 * - **No unused ingredients**: a chip that can match no recipe is a dead end.
 * - Sorted by usage, most-used first; ties alphabetical.
 *
 * Cached for an hour with the cookie-free client: it changes only on import.
 */
async function loadIngredientCatalog(): Promise<IngredientCatalog> {
  const sb = createStaticClient();
  const { data, error } = await sb
    .from("ingredients")
    .select(
      "id, canonical_name, aisle_category, is_pantry_staple, family_id, recipe_ingredients(count), ingredient_aliases(alias)",
    )
    .limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as CatalogRow[];

  const uses = new Map<number, number>();
  for (const r of rows) {
    const own = r.recipe_ingredients[0]?.count ?? 0;
    const target = r.family_id ?? r.id;
    uses.set(target, (uses.get(target) ?? 0) + own);
  }

  // Synonyms per tappable item: its own aliases, plus the name and aliases of
  // any family variant folded into it ("yellow onion" finds onion).
  const synonyms = new Map<number, Set<string>>();
  for (const r of rows) {
    const target = r.family_id ?? r.id;
    const set = synonyms.get(target) ?? new Set<string>();
    if (r.family_id !== null) set.add(r.canonical_name.toLowerCase());
    for (const a of r.ingredient_aliases) set.add(a.alias.toLowerCase());
    synonyms.set(target, set);
  }

  const byCategory = new Map<string, CatalogItem[]>();
  for (const r of rows) {
    if (r.family_id !== null || r.is_pantry_staple) continue;
    const n = uses.get(r.id) ?? 0;
    if (n === 0) continue;
    const category = (CATEGORY_ORDER as readonly string[]).includes(r.aisle_category)
      ? r.aisle_category
      : "Other";
    const list = byCategory.get(category) ?? [];
    const name = r.canonical_name.toLowerCase();
    const aka = [...(synonyms.get(r.id) ?? [])].filter((s) => s !== name).sort().join("|");
    list.push({ id: r.id, name: r.canonical_name, uses: n, ...(aka ? { aka } : {}) });
    byCategory.set(category, list);
  }

  const categories = [...CATEGORY_ORDER, "Other"]
    .filter((name) => (byCategory.get(name)?.length ?? 0) > 0)
    .map((name) => ({
      name,
      items: byCategory.get(name)!.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)),
    }));

  return { categories };
}

export const getIngredientCatalog = unstable_cache(loadIngredientCatalog, ["ingredient-catalog"], {
  revalidate: 3600,
});

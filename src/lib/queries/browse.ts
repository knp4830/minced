/* The /recipes list without a search term: PostgREST query with the shared filters, cached 5 min (unstable_cache, cookie-free client), plus filter options and card extras. With ?q= the list comes from search.ts. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { resultFilters, type RecipeFilters } from "@/lib/filters";
import { needsAttribution, photoPublicUrl, usableImageUrl } from "@/lib/photos";
import { primaryAisle } from "@/lib/placeholderTone";
import { createStaticClient } from "@/lib/supabase/static";
import { encodeSearchCursor, searchRecipes } from "@/lib/queries/search";
import type { RecipeCardProps } from "@/components/recipe/recipeCard";

/**
 * Browse (no search text) and the card shaping shared with search.
 *
 * Why this is PostgREST and not a Postgres function: browse is a filtered,
 * keyset-paged LIST, not a ranking problem, and the filters are all expressible
 * as joins on tables that already exist. The ranking queries (pantry matcher,
 * text search) stay RPCs, as CLAUDE.md requires. If browse ever needs ranking
 * (e.g. "popular"), move it into a `browse_recipes()` function.
 *
 * Filtering and paging both happen in Postgres; nothing is fetched and filtered
 * in JavaScript.
 */

export const PAGE_SIZE = 24;
/** How many rows the first search page asks for, only to be able to say "N results". */
const COUNT_PROBE = 99;

export type RecipePage = {
  recipes: RecipeCardProps[];
  /** Ready for `?cursor=`; null on the last page. */
  nextCursor: string | null;
  /** Exact for browse; for search a lower bound (see `totalIsLowerBound`). Only on page one. */
  total: number | null;
  totalIsLowerBound: boolean;
  /** Search found nothing by words and fell back to look-alike titles. */
  fuzzy: boolean;
};

type PhotoRow = {
  storage_path: string;
  thumb_path: string | null;
  credit: string | null;
  license: string;
};

type CardRow = {
  id: string;
  slug: string;
  title: string;
  servings: number;
  total_time_min: number | null;
  calories: number | null;
  image_url: string | null;
  spice_level: number | null;
  source_name: string | null;
  cuisines: { name: string } | null;
  recipe_allergens: { basis: string; allergens: { slug: string; name: string } | null }[];
  /** Allergens that come only from optional lines: the recipe is fine without them. */
  recipe_optional_allergens: { allergens: { slug: string; name: string } | null }[];
  has_photo: boolean;
  /** Embedded one-to-one (recipe_id is the PK); PostgREST returns an object, null when none. */
  recipe_photos: PhotoRow | PhotoRow[] | null;
  recipe_ingredients: {
    sort_order: number;
    is_optional: boolean;
    ingredients: { aisle_category: string; is_pantry_staple: boolean } | null;
  }[];
};

const CARD_COLUMNS =
  "id, slug, title, servings, total_time_min, calories, image_url, spice_level, source_name, cuisines(name), recipe_allergens(basis, allergens(slug, name)), recipe_optional_allergens(allergens(slug, name)), has_photo, recipe_photos(storage_path, thumb_path, credit, license), recipe_ingredients(sort_order, is_optional, ingredients(aisle_category, is_pantry_staple))";

export const AI_SOURCE_NAME = "Minced original";
/** recipes.source_name written by save_my_recipe() for every user-submitted recipe. */
export const USER_SOURCE_NAME = "User submission";

type CardPhoto = { url: string; credit: string | null };

function cardPhoto(row: CardRow): CardPhoto | null {
  const p = Array.isArray(row.recipe_photos) ? row.recipe_photos[0] : row.recipe_photos;
  if (!p) return null;
  return {
    url: photoPublicUrl(p.thumb_path ?? p.storage_path),
    credit: needsAttribution(p.license) && p.credit ? `${p.credit} · ${p.license}` : null,
  };
}

/**
 * `exclude` is the allergen filter in force. An optional-only allergen the person is leaving out is named on the
 * card ("optional peanuts"), because the filter keeps such a recipe in the list on purpose.
 */
function toCard(row: CardRow, exclude?: readonly string[]): RecipeCardProps {
  const photo = cardPhoto(row);
  const lower = (names: (string | undefined)[]) => names.filter((n): n is string => !!n).map((n) => n.toLowerCase());
  const optionalNamed = lower(
    row.recipe_optional_allergens.map((a) => (a.allergens && exclude?.includes(a.allergens.slug) ? a.allergens.name : undefined)),
  );
  return {
    slug: row.slug,
    title: row.title,
    cuisine: row.cuisines?.name ?? null,
    aisle: primaryAisle(row.recipe_ingredients),
    imageUrl: photo?.url ?? usableImageUrl(row.image_url),
    photoCredit: photo?.credit ?? null,
    totalTimeMin: row.total_time_min,
    servings: row.servings,
    calories: row.calories,
    spiceLevel: row.spice_level,
    allergens: lower(row.recipe_allergens.map((a) => (a.basis === "varies" ? undefined : a.allergens?.name))),
    mayContainAllergens: lower(row.recipe_allergens.map((a) => (a.basis === "varies" ? a.allergens?.name : undefined))),
    optionalAllergens: optionalNamed,
    aiDrafted: row.source_name === AI_SOURCE_NAME,
  };
}

/** PostgREST `or=(...)` values containing commas/quotes/parens must be quoted. */
function quoteValue(v: string): string {
  return `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Browse order is (photo first, title, id); the cursor carries all three keys. */
function encodeBrowseCursor(hasPhoto: boolean, title: string, id: string): string {
  return Buffer.from(JSON.stringify([hasPhoto, title, id]), "utf8").toString("base64url");
}

function decodeBrowseCursor(
  raw: string | undefined,
): { hasPhoto: boolean; title: string; id: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      Array.isArray(v) &&
      typeof v[0] === "boolean" &&
      typeof v[1] === "string" &&
      typeof v[2] === "string" &&
      uuid.test(v[2])
    ) {
      return { hasPhoto: v[0], title: v[1], id: v[2] };
    }
  } catch {
    /* fall through: a mangled (or pre-photos-first) cursor means page one */
  }
  return null;
}

/**
 * All of the filters, expressed for PostgREST. Range filters follow the NULL
 * rule from the filter contract: unknown spice / calories / protein PASS, but an
 * unknown TIME does not (a recipe with no stated time is left out once a time filter is set).
 */
// The builder's generic type changes with every call; the filters only chain
// methods that exist on every PostgREST builder, so it is typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends Record<string, any>>(query: T, f: RecipeFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query;
  // TIME is the one range filter that EXCLUDES unknowns (owner decision, wave 14): once a time is asked for, a
  // recipe with no stated time (NULL, or 0 which is how the importer stored "none") is not an answer to it.
  if (f.minTime !== undefined) q = q.gt("total_time_min", 0).gte("total_time_min", f.minTime);
  if (f.maxTime !== undefined) q = q.gt("total_time_min", 0).lte("total_time_min", f.maxTime);
  if (f.spiceMax !== undefined) q = q.or(`spice_level.is.null,spice_level.lte.${f.spiceMax}`);
  if (f.calMin !== undefined) q = q.or(`calories.is.null,calories.gte.${f.calMin}`);
  if (f.calMax !== undefined) q = q.or(`calories.is.null,calories.lte.${f.calMax}`);
  if (f.proteinMin !== undefined) q = q.or(`protein_g.is.null,protein_g.gte.${f.proteinMin}`);
  if (f.cuisine?.length) q = q.in("cuisines.slug", f.cuisine);
  // Diets are NOT filtered here: pescatarian accepts vegetarian and vegan recipes, a rule that
  // lives in Postgres (diet_satisfying) and is applied by filtered_recipes(), which loadBrowse
  // reads whenever a diet is set.
  // Allergens: an embed filter on the table; on the filtered_recipes() path the function does it
  // (PostgREST cannot filter a to-many embed on an RPC result: 42703 "recipes_ex_1 does not exist").
  if (f.exclude?.length && !usesFilteredRecipes(f)) {
    q = q.in("ex.allergens.slug", f.exclude).filter("ex", "is", "null");
  }
  // Recipes that USE any selected cookware. An inner embed keeps a parent only
  // when a matching child exists (no duplicates when it has several); recipes
  // with no cookware rows never match, per the shared contract.
  if (f.cookware?.length) q = q.in("cw.cookware.slug", f.cookware);
  // "Only what I can make with my cookware" and "contains these ingredients" are not
  // filters here: with either on, the list is read from filtered_recipes(owned, include)
  // instead of the table (see loadBrowse), because "any member of an alternatives group is
  // owned" and "ingredient or its family" cannot be written as PostgREST filters.
  return q as T;
}

/** True when the list is read from the filtered_recipes() RPC instead of the table. */
function usesFilteredRecipes(f: RecipeFilters): boolean {
  return !!f.ownedOnly || !!f.include?.length || !!f.diet?.length;
}

function selectFor(f: RecipeFilters): string {
  const parts = [CARD_COLUMNS.replace("cuisines(name)", f.cuisine?.length ? "cuisines!inner(name)" : "cuisines(name)")];
  if (f.exclude?.length && !usesFilteredRecipes(f)) parts.push("ex:recipe_allergens(allergens!inner(slug))");
  if (f.cookware?.length) parts.push("cw:recipe_cookware!inner(cookware!inner(slug))");
  return parts.join(", ");
}

/** Browse: every recipe, photo first then A-Z, filtered, keyset-paged on (has_photo, title, id). */
async function loadBrowse(
  filters: RecipeFilters,
  limit = PAGE_SIZE,
): Promise<RecipePage> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const cursor = decodeBrowseCursor(filters.cursor);

  // With "only my cookware" on, read the recipes the cook can make (alternatives
  // groups: owning any member is enough); otherwise the table itself.
  // Likewise "contains these ingredients" (family-expanded). One RPC does both, and
  // PostgREST still filters, embeds, orders and pages on top of its rows.
  const countOpt = cursor ? undefined : { count: "exact" as const };
  const useRpc = usesFilteredRecipes(filters);
  let query = useRpc
    ? sb
        .rpc(
          "filtered_recipes",
          {
            owned: filters.ownedOnly ? (filters.ownedCookware ?? []) : null,
            include_ids: filters.include?.length ? filters.include : null,
            diet_slugs: filters.diet?.length ? filters.diet : null,
            exclude_slugs: filters.exclude?.length ? filters.exclude : null,
          },
          countOpt,
        )
        .select(selectFor(filters))
    : sb.from("recipes").select(selectFor(filters), countOpt);
  query = applyFilters(query, filters);
  if (cursor) {
    const t = quoteValue(cursor.title);
    const hp = cursor.hasPhoto;
    // has_photo sorts DESC (true first), so "after" means a lower flag, or the same flag and a later (title, id).
    query = query.or(
      `has_photo.lt.${hp},and(has_photo.eq.${hp},title.gt.${t}),and(has_photo.eq.${hp},title.eq.${t},id.gt.${cursor.id})`,
    );
  }
  const { data, error, count } = await query
    .order("has_photo", { ascending: false })
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (error) throw error;

  const rows = (data ?? []) as unknown as CardRow[];
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    recipes: page.map((r) => toCard(r, filters.exclude)),
    nextCursor: rows.length > limit && last ? encodeBrowseCursor(last.has_photo, last.title, last.id) : null,
    total: cursor ? null : (count ?? page.length),
    totalIsLowerBound: false,
    fuzzy: false,
  };
}

/**
 * Search (`?q=`): ranked by `search_recipes`, then decorated with the card
 * extras (cuisine, allergens, AI flag) that the RPC does not return.
 *
 * Page one asks the RPC for up to 99 rows once, purely so the page can say
 * "99+ recipes" without a second count query; it still shows 24 and pages from
 * the 24th row's cursor. Later pages ask for exactly one page.
 */
async function loadSearch(
  filters: RecipeFilters,
  limit = PAGE_SIZE,
): Promise<RecipePage> {
  const firstPage = !filters.cursor;
  const { results, nextCursor } = await searchRecipes(filters, {
    limit: firstPage ? COUNT_PROBE : limit,
  });

  const shown = results.slice(0, limit);
  const last = shown.at(-1);
  const hasMore = results.length > limit || nextCursor !== null;
  const pageCursor =
    hasMore && last ? encodeSearchCursor({ score: last.score, id: last.id }) : null;

  const sb = createStaticClient() as unknown as SupabaseClient;
  const ids = shown.map((r) => r.id);
  const details = new Map<string, CardRow>();
  if (ids.length) {
    const { data, error } = await sb.from("recipes").select(CARD_COLUMNS).in("id", ids);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as CardRow[]) details.set(row.id, row);
  }

  const recipes = shown.map((r) => {
    const d = details.get(r.id);
    return d
      ? toCard(d, filters.exclude)
      : ({
          slug: r.slug,
          title: r.title,
          imageUrl: usableImageUrl(r.image_url),
          totalTimeMin: r.total_time_min,
          servings: r.servings,
          calories: r.calories,
        } satisfies RecipeCardProps);
  });

  return {
    recipes,
    nextCursor: pageCursor,
    total: firstPage ? results.length : null,
    totalIsLowerBound: firstPage && nextCursor !== null,
    fuzzy: shown[0]?.matchKind === "fuzzy",
  };
}

/**
 * Card extras for recipes found by another door (the pantry matcher): photo,
 * credit, cuisine, spice, allergens and the AI-draft flag, keyed by recipe id.
 * Keeps the pantry cards identical to browse/search cards.
 */
async function loadCardExtras(ids: string[], exclude?: string[]): Promise<Record<string, RecipeCardProps>> {
  const out: Record<string, RecipeCardProps> = {};
  if (ids.length === 0) return out;
  const sb = createStaticClient() as unknown as SupabaseClient;
  const { data, error } = await sb.from("recipes").select(CARD_COLUMNS).in("id", ids);
  if (error) throw error;
  for (const row of (data ?? []) as unknown as CardRow[]) out[row.id] = toCard(row, exclude);
  return out;
}

/*
 * Results cache. Every list below is the same for every anonymous visitor, so
 * a repeat of the same filters/cursor/pantry is served from Next's data cache
 * (5 min, stale-while-revalidate) instead of a database round trip; a new
 * recipe or photo shows up within one TTL. They use the cookie-free client:
 * `unstable_cache` cannot read request cookies, and what the anon role may read
 * (published recipes) is exactly what these lists show. When signed-in authors
 * can see their own drafts in lists (M5), those need an uncached, per-user path.
 */
const LIST_TTL_SECONDS = 300;

export const browseRecipes = unstable_cache(loadBrowse, ["browse-recipes"], {
  revalidate: LIST_TTL_SECONDS,
});
export const searchCards = unstable_cache(loadSearch, ["search-cards"], {
  revalidate: LIST_TTL_SECONDS,
});
export const getCardExtras = unstable_cache(loadCardExtras, ["card-extras"], {
  revalidate: LIST_TTL_SECONDS,
});

/** One entry point for the page: search when there is a query, browse otherwise. */
export async function getRecipePage(filters: RecipeFilters): Promise<RecipePage> {
  const f = resultFilters(filters);
  return f.q ? searchCards(f) : browseRecipes(f);
}

export type FilterOptions = {
  cuisines: { slug: string; name: string; count: number }[];
  diets: { slug: string; name: string }[];
  allergens: { slug: string; name: string }[];
  /** Only cookware at least one recipe uses; a chip with no results is a dead end. */
  cookware: { slug: string; name: string }[];
  /** The whole cookware vocabulary: what a cook can say they own, used or not. */
  allCookware: { slug: string; name: string }[];
  /** Ingredient chips for the "Contains" filter, by shelf, most-used first. */
  ingredientGroups: IngredientGroup[];
};

export type IngredientGroup = {
  slug: string;
  name: string;
  items: { id: number; name: string; uses: number }[];
};

/** Shelf order and wording for the "Contains" filter. Slugs are `ingredients.filter_group`, plus "dairy". */
const INGREDIENT_GROUPS = [
  { slug: "vegetables", name: "Vegetables" },
  { slug: "fruit", name: "Fruit" },
  { slug: "herbs", name: "Fresh herbs" },
  { slug: "meat", name: "Meat & poultry" },
  { slug: "seafood", name: "Seafood" },
  { slug: "dairy", name: "Dairy & eggs" },
  { slug: "legumes", name: "Beans, lentils & tofu" },
  { slug: "grains", name: "Grains, pasta & bread" },
  { slug: "nuts", name: "Nuts & seeds" },
  { slug: "spices", name: "Spices" },
  { slug: "pantry", name: "Pantry & sauces" },
] as const;

const AISLE_SHELF: Record<string, string> = {
  Produce: "vegetables",
  Protein: "meat",
  Dairy: "dairy",
  Spices: "spices",
  Other: "grains",
  Pantry: "pantry",
};

type IngredientRow = {
  id: number;
  canonical_name: string;
  aisle_category: string;
  filter_group: string | null;
  is_pantry_staple: boolean;
  family_id: number | null;
  recipe_ingredients: { count: number }[];
};

/**
 * One chip per family PARENT ("onion", not "yellow onion"): the filter expands a
 * parent to its variants in Postgres, so offering both would be two taps for one
 * answer. A variant's usage is credited to its parent. Pantry staples are left out
 * (salt, oil: nearly every recipe has them, so the chip would filter nothing), as are
 * ingredients no recipe uses (a dead end).
 */
function buildIngredientGroups(rows: IngredientRow[]): IngredientGroup[] {
  const uses = new Map<number, number>();
  for (const r of rows) {
    const target = r.family_id ?? r.id;
    uses.set(target, (uses.get(target) ?? 0) + (r.recipe_ingredients[0]?.count ?? 0));
  }
  const byShelf = new Map<string, IngredientGroup["items"]>();
  for (const r of rows) {
    if (r.family_id !== null || r.is_pantry_staple) continue;
    const n = uses.get(r.id) ?? 0;
    if (n === 0) continue;
    // Eggs sit on their own shelf in the database; the panel shows them with dairy.
    const raw = r.filter_group ?? AISLE_SHELF[r.aisle_category] ?? "pantry";
    const shelf = raw === "eggs" ? "dairy" : raw;
    const list = byShelf.get(shelf) ?? [];
    list.push({ id: r.id, name: r.canonical_name.toLowerCase(), uses: n });
    byShelf.set(shelf, list);
  }
  return INGREDIENT_GROUPS.filter((g) => (byShelf.get(g.slug)?.length ?? 0) > 0).map((g) => ({
    slug: g.slug,
    name: g.name,
    items: byShelf.get(g.slug)!.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)),
  }));
}

/**
 * Vocabularies for the filter panel. Cuisines are listed only if at least one
 * recipe has them: most imported recipes have no cuisine, and a chip that
 * returns zero results is a dead end.
 */
async function loadFilterOptions(): Promise<FilterOptions> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const [cuisines, diets, allergens, cookware, ingredients] = await Promise.all([
    sb.from("cuisines").select("slug, name, recipes(count)").order("name"),
    sb.from("diets").select("slug, name").order("name"),
    sb.from("allergens").select("slug, name").order("name"),
    sb.from("cookware").select("slug, name, recipe_cookware(count)").order("name"),
    sb
      .from("ingredients")
      .select("id, canonical_name, aisle_category, filter_group, is_pantry_staple, family_id, recipe_ingredients(count)")
      .limit(5000),
  ]);
  if (cuisines.error) throw cuisines.error;
  if (diets.error) throw diets.error;
  if (allergens.error) throw allergens.error;
  if (cookware.error) throw cookware.error;
  if (ingredients.error) throw ingredients.error;

  return {
    cuisines: (cuisines.data as { slug: string; name: string; recipes: { count: number }[] }[])
      .map((c) => ({ slug: c.slug, name: c.name, count: c.recipes[0]?.count ?? 0 }))
      .filter((c) => c.count > 0),
    diets: diets.data as FilterOptions["diets"],
    allergens: allergens.data as FilterOptions["allergens"],
    cookware: (cookware.data as { slug: string; name: string; recipe_cookware: { count: number }[] }[])
      .filter((c) => (c.recipe_cookware[0]?.count ?? 0) > 0)
      .map(({ slug, name }) => ({ slug, name })),
    allCookware: (cookware.data as { slug: string; name: string }[]).map(({ slug, name }) => ({
      slug,
      name,
    })),
    ingredientGroups: buildIngredientGroups((ingredients.data ?? []) as unknown as IngredientRow[]),
  };
}

/**
 * Cached for an hour: these vocabularies change only when recipes are imported,
 * and the panel renders on every browse/search request. Uses the cookie-free
 * client because unstable_cache cannot read request cookies.
 */
export const getFilterOptions = unstable_cache(loadFilterOptions, ["filter-options-v3"], {
  revalidate: 3600,
});

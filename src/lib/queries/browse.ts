import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import type { RecipeFilters } from "@/lib/filters";
import { needsAttribution, photoPublicUrl, usableImageUrl } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
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
  recipe_allergens: { allergens: { name: string } | null }[];
};

const CARD_COLUMNS =
  "id, slug, title, servings, total_time_min, calories, image_url, spice_level, source_name, cuisines(name), recipe_allergens(allergens(name))";

export const AI_SOURCE_NAME = "Minced original";

type CardPhoto = { url: string; credit: string | null };

function toCard(row: CardRow, photos: Map<string, CardPhoto>): RecipeCardProps {
  const photo = photos.get(row.id);
  return {
    slug: row.slug,
    title: row.title,
    cuisine: row.cuisines?.name ?? null,
    imageUrl: photo?.url ?? usableImageUrl(row.image_url),
    photoCredit: photo?.credit ?? null,
    totalTimeMin: row.total_time_min,
    servings: row.servings,
    calories: row.calories,
    spiceLevel: row.spice_level,
    allergens: row.recipe_allergens
      .map((a) => a.allergens?.name.toLowerCase())
      .filter((n): n is string => !!n),
    aiDrafted: row.source_name === AI_SOURCE_NAME,
  };
}

/**
 * Card photos keyed by recipe id: the thumbnail URL plus, for licences that
 * require it (CC BY / CC BY-SA), the credit line. The `recipe_photos` table
 * arrives with the photos lane; until it is applied the query errors and this
 * returns an empty map, so cards fall back to the legacy URL or the placeholder.
 */
async function loadPhotos(sb: SupabaseClient, ids: string[]): Promise<Map<string, CardPhoto>> {
  const out = new Map<string, CardPhoto>();
  if (ids.length === 0) return out;
  const { data, error } = await sb
    .from("recipe_photos")
    .select("recipe_id, storage_path, thumb_path, credit, license")
    .in("recipe_id", ids);
  if (error || !data) return out;
  for (const p of data as {
    recipe_id: string;
    storage_path: string;
    thumb_path: string | null;
    credit: string | null;
    license: string;
  }[]) {
    out.set(p.recipe_id, {
      url: photoPublicUrl(p.thumb_path ?? p.storage_path),
      credit: needsAttribution(p.license) && p.credit ? `${p.credit} · ${p.license}` : null,
    });
  }
  return out;
}

/** PostgREST `or=(...)` values containing commas/quotes/parens must be quoted. */
function quoteValue(v: string): string {
  return `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function encodeBrowseCursor(title: string, id: string): string {
  return Buffer.from(JSON.stringify([title, id]), "utf8").toString("base64url");
}

function decodeBrowseCursor(raw: string | undefined): { title: string; id: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (Array.isArray(v) && typeof v[0] === "string" && typeof v[1] === "string" && uuid.test(v[1])) {
      return { title: v[0], id: v[1] };
    }
  } catch {
    /* fall through: a mangled cursor means page one */
  }
  return null;
}

/**
 * All of the filters, expressed for PostgREST. Range filters follow the NULL
 * rule from the filter contract: unknown time / spice / calories / protein PASS.
 * Most of the catalog is USDA MyPlate with no cook time; dropping unknowns would
 * make "under 30 min" hide nearly everything.
 */
// The builder's generic type changes with every call; the filters only chain
// methods that exist on every PostgREST builder, so it is typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends Record<string, any>>(query: T, f: RecipeFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query;
  if (f.maxTime !== undefined) {
    q = q.or(`total_time_min.is.null,total_time_min.eq.0,total_time_min.lte.${f.maxTime}`);
  }
  if (f.spiceMax !== undefined) q = q.or(`spice_level.is.null,spice_level.lte.${f.spiceMax}`);
  if (f.calMin !== undefined) q = q.or(`calories.is.null,calories.gte.${f.calMin}`);
  if (f.calMax !== undefined) q = q.or(`calories.is.null,calories.lte.${f.calMax}`);
  if (f.proteinMin !== undefined) q = q.or(`protein_g.is.null,protein_g.gte.${f.proteinMin}`);
  if (f.cuisine?.length) q = q.in("cuisines.slug", f.cuisine);
  (f.diet ?? []).forEach((slug, i) => {
    q = q.eq(`diet${i}.diets.slug`, slug);
  });
  if (f.exclude?.length) {
    q = q.in("ex.allergens.slug", f.exclude).filter("ex", "is", "null");
  }
  return q as T;
}

function selectFor(f: RecipeFilters): string {
  const parts = [CARD_COLUMNS.replace("cuisines(name)", f.cuisine?.length ? "cuisines!inner(name)" : "cuisines(name)")];
  (f.diet ?? []).forEach((_, i) => parts.push(`diet${i}:recipe_diets!inner(diets!inner(slug))`));
  if (f.exclude?.length) parts.push("ex:recipe_allergens(allergens!inner(slug))");
  return parts.join(", ");
}

/** Browse: every recipe, A-Z, filtered, keyset-paged on (title, id). */
export async function browseRecipes(
  filters: RecipeFilters,
  limit = PAGE_SIZE,
): Promise<RecipePage> {
  const sb = (await createClient()) as unknown as SupabaseClient;
  const cursor = decodeBrowseCursor(filters.cursor);

  let query = sb
    .from("recipes")
    .select(selectFor(filters), cursor ? undefined : { count: "exact" });
  query = applyFilters(query, filters);
  if (cursor) {
    const t = quoteValue(cursor.title);
    query = query.or(`title.gt.${t},and(title.eq.${t},id.gt.${cursor.id})`);
  }
  const { data, error, count } = await query
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (error) throw error;

  const rows = (data ?? []) as unknown as CardRow[];
  const page = rows.slice(0, limit);
  const photos = await loadPhotos(sb, page.map((r) => r.id));
  const last = page.at(-1);

  return {
    recipes: page.map((r) => toCard(r, photos)),
    nextCursor: rows.length > limit && last ? encodeBrowseCursor(last.title, last.id) : null,
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
export async function searchCards(
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

  const sb = (await createClient()) as unknown as SupabaseClient;
  const ids = shown.map((r) => r.id);
  const details = new Map<string, CardRow>();
  if (ids.length) {
    const { data, error } = await sb.from("recipes").select(CARD_COLUMNS).in("id", ids);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as CardRow[]) details.set(row.id, row);
  }
  const photos = await loadPhotos(sb, ids);

  const recipes = shown.map((r) => {
    const d = details.get(r.id);
    return d
      ? toCard(d, photos)
      : ({
          slug: r.slug,
          title: r.title,
          imageUrl: photos.get(r.id)?.url ?? usableImageUrl(r.image_url),
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
export async function getCardExtras(ids: string[]): Promise<Map<string, RecipeCardProps>> {
  const out = new Map<string, RecipeCardProps>();
  if (ids.length === 0) return out;
  const sb = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await sb.from("recipes").select(CARD_COLUMNS).in("id", ids);
  if (error) throw error;
  const photos = await loadPhotos(sb, ids);
  for (const row of (data ?? []) as unknown as CardRow[]) out.set(row.id, toCard(row, photos));
  return out;
}

/** One entry point for the page: search when there is a query, browse otherwise. */
export async function getRecipePage(filters: RecipeFilters): Promise<RecipePage> {
  return filters.q ? searchCards(filters) : browseRecipes(filters);
}

export type FilterOptions = {
  cuisines: { slug: string; name: string; count: number }[];
  diets: { slug: string; name: string }[];
  allergens: { slug: string; name: string }[];
};

/**
 * Vocabularies for the filter panel. Cuisines are listed only if at least one
 * recipe has them: most imported recipes have no cuisine, and a chip that
 * returns zero results is a dead end.
 */
async function loadFilterOptions(): Promise<FilterOptions> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const [cuisines, diets, allergens] = await Promise.all([
    sb.from("cuisines").select("slug, name, recipes(count)").order("name"),
    sb.from("diets").select("slug, name").order("name"),
    sb.from("allergens").select("slug, name").order("name"),
  ]);
  if (cuisines.error) throw cuisines.error;
  if (diets.error) throw diets.error;
  if (allergens.error) throw allergens.error;

  return {
    cuisines: (cuisines.data as { slug: string; name: string; recipes: { count: number }[] }[])
      .map((c) => ({ slug: c.slug, name: c.name, count: c.recipes[0]?.count ?? 0 }))
      .filter((c) => c.count > 0),
    diets: diets.data as FilterOptions["diets"],
    allergens: allergens.data as FilterOptions["allergens"],
  };
}

/**
 * Cached for an hour: these vocabularies change only when recipes are imported,
 * and the panel renders on every browse/search request. Uses the cookie-free
 * client because unstable_cache cannot read request cookies.
 */
export const getFilterOptions = unstable_cache(loadFilterOptions, ["filter-options"], {
  revalidate: 3600,
});

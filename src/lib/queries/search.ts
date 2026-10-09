import { createClient } from "@/lib/supabase/server";

import type { RecipeCard } from "@/lib/queries/recipes";

/**
 * Filters shared with the pantry matcher (M3.4). Names mirror the Postgres
 * parameters of `search_recipes` one-to-one (camelCase here, snake_case there)
 * so the two features can take the same URL params.
 *
 * Every field is optional and means "no constraint" when absent.
 */
export type RecipeFilters = {
  /** `total_time_min <=`. Recipes with unknown time are excluded when set. */
  maxTotalMin?: number;
  maxPrepMin?: number;
  /** Cuisine slugs; a recipe matches if it is ANY of them. */
  cuisineSlugs?: string[];
  /** Diet slugs; a recipe must carry ALL of them. */
  dietSlugs?: string[];
  /** Allergen slugs; a recipe must carry NONE of them. */
  excludeAllergenSlugs?: string[];
  maxSpice?: number;
  minCalories?: number;
  maxCalories?: number;
  minProteinG?: number;
  maxProteinG?: number;
  minCarbsG?: number;
  maxCarbsG?: number;
  minFatG?: number;
  maxFatG?: number;
};

/**
 * `text`  — the query's words were found (stemmed, ranked by weight).
 * `fuzzy` — no recipe contains those words, so these are look-alike titles
 *           ("shakshouka" -> Shakshuka). A UI should say "showing results for
 *           similar spellings" rather than present them as exact matches.
 */
export type SearchMatchKind = "text" | "fuzzy";

export type SearchResult = RecipeCard & {
  score: number;
  matchKind: SearchMatchKind;
};

/** Opaque to callers: store it in `?cursor=`, hand it back for the next page. */
export type SearchCursor = { score: number; id: string };

export type SearchPage = {
  results: SearchResult[];
  /** `null` when this is the last page. */
  nextCursor: SearchCursor | null;
};

type SearchRpcRow = {
  id: string;
  slug: string;
  title: string;
  servings: number;
  total_time_min: number | null;
  calories: number | null;
  image_url: string | null;
  score: number;
  match_kind: SearchMatchKind;
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100; // the Postgres function clamps to the same value

/** `0.149:3f2b…` — the shape that goes in a URL. Score first: ids contain no `:`. */
export function encodeSearchCursor(cursor: SearchCursor): string {
  return `${cursor.score}:${cursor.id}`;
}

/** Returns `null` for anything malformed, so a mangled URL means "page one". */
export function decodeSearchCursor(raw: string | null | undefined): SearchCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep < 1) return null;
  const score = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Number.isFinite(score) || !uuid.test(id)) return null;
  return { score, id };
}

/** Maps camelCase filters to the RPC's argument names. Exported for testing. */
export function buildSearchArgs(
  q: string,
  filters: RecipeFilters,
  limit: number,
  cursor: SearchCursor | null,
) {
  return {
    q,
    max_total_min: filters.maxTotalMin,
    max_prep_min: filters.maxPrepMin,
    cuisine_slugs: filters.cuisineSlugs,
    diet_slugs: filters.dietSlugs,
    exclude_allergen_slugs: filters.excludeAllergenSlugs,
    max_spice: filters.maxSpice,
    min_calories: filters.minCalories,
    max_calories: filters.maxCalories,
    min_protein_g: filters.minProteinG,
    max_protein_g: filters.maxProteinG,
    min_carbs_g: filters.minCarbsG,
    max_carbs_g: filters.maxCarbsG,
    min_fat_g: filters.minFatG,
    max_fat_g: filters.maxFatG,
    // One extra row tells us whether another page exists without a count query.
    result_limit: limit + 1,
    cursor_score: cursor?.score,
    cursor_id: cursor?.id,
  };
}

/**
 * Ranked recipe search — "Door 2". Ranking, typo tolerance, filtering and the
 * cursor all live in the `search_recipes` Postgres function (see its migration
 * for the tsvector/weights/trigram explanation); this is only the typed seam.
 *
 * An empty or stop-word-only query returns no results — listing recipes with no
 * query is browse's job (`getRecipeCards`), not search's.
 *
 * RLS applies: results are what the caller may read (published recipes plus
 * their own drafts), same as every other query in this folder.
 */
export async function searchRecipes(
  q: string,
  options: {
    filters?: RecipeFilters;
    limit?: number;
    cursor?: SearchCursor | null;
  } = {},
): Promise<SearchPage> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT - 1);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "search_recipes",
    buildSearchArgs(q, options.filters ?? {}, limit, options.cursor ?? null),
  );
  if (error) throw error;

  const rows = (data ?? []) as SearchRpcRow[];
  const page = rows.slice(0, limit);

  const results: SearchResult[] = page.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    servings: row.servings,
    total_time_min: row.total_time_min,
    calories: row.calories,
    image_url: row.image_url,
    score: row.score,
    matchKind: row.match_kind,
  }));

  const last = results.at(-1);
  return {
    results,
    nextCursor:
      rows.length > limit && last ? { score: last.score, id: last.id } : null,
  };
}

import { createClient } from "@/lib/supabase/server";

import type { RecipeFilters } from "@/lib/filters";
import type { RecipeCard } from "@/lib/queries/recipes";

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
  /** Ready for `?cursor=` (see `withFilters`); `null` on the last page. */
  nextCursor: string | null;
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

/** Maps the shared RecipeFilters to `search_recipes` arguments. Exported for testing. */
export function buildSearchArgs(
  filters: RecipeFilters,
  limit: number,
  cursor: SearchCursor | null,
) {
  return {
    q: filters.q ?? "",
    max_total_min: filters.maxTime,
    cuisine_slugs: filters.cuisine,
    diet_slugs: filters.diet,
    exclude_allergen_slugs: filters.exclude,
    max_spice: filters.spiceMax,
    min_calories: filters.calMin,
    max_calories: filters.calMax,
    min_protein_g: filters.proteinMin,
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
  filters: RecipeFilters,
  options: { limit?: number } = {},
): Promise<SearchPage> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT - 1);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "search_recipes",
    buildSearchArgs(filters, limit, decodeSearchCursor(filters.cursor)),
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
    // ts_rank / word_similarity are float4 widened to float8, but the REST
    // layer prints float8 with only 15 significant digits. Fed back as
    // `cursor_score` that rounding can land a hair ABOVE the real value, and the
    // tied rows on the previous page then satisfy `(score, id) < cursor` and
    // repeat on the next one (measured: q=chicken showed 156 cards, 154
    // distinct). Math.fround snaps it back to the exact float4, which is the
    // exact stored value.
    score: Math.fround(row.score),
    matchKind: row.match_kind,
  }));

  const last = results.at(-1);
  return {
    results,
    nextCursor:
      rows.length > limit && last
        ? encodeSearchCursor({ score: last.score, id: last.id })
        : null,
  };
}

import { unstable_cache } from "next/cache";

import { createStaticClient } from "@/lib/supabase/static";

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
    cookware_slugs: filters.cookware?.length ? filters.cookware : undefined,
    owned_cookware_slugs: filters.ownedOnly ? (filters.ownedCookware ?? []) : undefined,
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
  const original = filters.q ?? "";

  // Search what the person typed first. Rewriting every word that happens to be an
  // alias corrupted multi-word queries that already worked, so the synonym/shorthand
  // rewrite ("aubergine" → eggplant, "mac" → macaroni) is only a fallback when the
  // literal query finds almost nothing. Pagination follows whichever query won,
  // because the cursor carries the same q.
  const rewritten = expandShorthand(await rewriteSynonyms(original));
  const canRewrite = rewritten.toLowerCase() !== original.trim().toLowerCase();
  // Decide once, on the first page's shape, so "Show more" pages follow the same query.
  const firstLiteral = await runSearch({ ...filters, q: original, cursor: undefined }, limit);
  const firstAlt =
    canRewrite && firstLiteral.results.length < 3
      ? await runSearch({ ...filters, q: rewritten, cursor: undefined }, limit)
      : null;
  const useAlt = !!firstAlt && firstAlt.results.length > firstLiteral.results.length;
  const chosenQ = useAlt ? rewritten : original;
  let page = filters.cursor
    ? await runSearch({ ...filters, q: chosenQ }, limit)
    : useAlt
      ? firstAlt!
      : firstLiteral;

  // Nothing found for a single word: it may be a typo of an ingredient
  // ("chiken"). Retry once with the closest canonical ingredient name.
  if (page.results.length === 0 && !filters.cursor) {
    const fixed = await closestIngredientName(original);
    if (fixed && fixed.toLowerCase() !== rewritten.toLowerCase()) {
      page = await runSearch({ ...filters, q: fixed }, limit);
    }
  }
  return page;
}

type ResolveRow = { canonical_name: string; match_kind: string };

async function loadResolved(raw: string): Promise<ResolveRow | null> {
  const supabase = createStaticClient();
  const { data, error } = await supabase.rpc("resolve_ingredient", { raw_name: raw }).maybeSingle();
  if (error) throw error;
  return (data as ResolveRow | null) ?? null;
}

/** Ingredient vocabulary changes only on import, so repeat lookups are cached for an hour. */
const cachedResolve = unstable_cache(loadResolved, ["search-resolve-word"], { revalidate: 3600 });

async function resolveWord(raw: string): Promise<ResolveRow | null> {
  try {
    return await cachedResolve(raw.toLowerCase());
  } catch {
    return null; // synonym help is best effort: never fail a search over it
  }
}

/**
 * Replaces regional synonyms (aubergine, courgette, capsicum, prawns) with the
 * canonical ingredient name, using the same `resolve_ingredient` the fridge uses.
 * Only exact alias hits are rewritten, never fuzzy ones, so "chicken soup"
 * is left alone.
 */
async function rewriteSynonyms(q: string): Promise<string> {
  const trimmed = q.trim();
  if (!trimmed) return q;
  const words = trimmed.split(/\s+/).slice(0, 8);

  const whole = await resolveWord(trimmed);
  if (whole && whole.match_kind === "alias") return whole.canonical_name;
  if (words.length === 1 && !whole) return q;

  const resolved = await Promise.all(words.map((w) => (w.length > 2 ? resolveWord(w) : null)));
  return words
    .map((w, i) => {
      const r = resolved[i];
      return r && r.match_kind === "alias" ? r.canonical_name : w;
    })
    .join(" ");
}

/** Cook shorthand that is not an ingredient alias: "mac and cheese" means macaroni. */
const SHORTHAND: Record<string, string> = { mac: "macaroni" };

function expandShorthand(q: string): string {
  return q
    .split(/\s+/)
    .map((w) => SHORTHAND[w.toLowerCase()] ?? w)
    .join(" ");
}

async function closestIngredientName(q: string): Promise<string | null> {
  const trimmed = q.trim();
  if (trimmed.length < 4 || /\s/.test(trimmed)) return null;
  const r = await resolveWord(trimmed);
  return r ? r.canonical_name : null;
}

async function runSearch(filters: RecipeFilters, limit: number): Promise<SearchPage> {
  const supabase = createStaticClient();

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

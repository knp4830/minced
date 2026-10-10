/**
 * The filter contract shared by BOTH doors (pantry matcher and search).
 *
 * One type, one URL shape, one parser. Filter state lives in URL search params
 * (CLAUDE.md), so every page reads `parseFilters(await searchParams)` and every
 * link is built with `filtersToQuery(...)`. Never a `useState` copy.
 *
 * -- URL param  ->  RecipeFilters field  ->  Postgres parameter ----------------
 *
 *   q          q           text      search_recipes(q)
 *   pantry     pantry      int[]     match_recipes(pantry_ids)      "12,40,7"
 *   use        use         int[]     match_recipes(must_use_ids)    "use it up"
 *   maxMissing maxMissing  int       match_recipes(max_missing)
 *   maxTime    maxTime     int min   max_total_min    (both RPCs)
 *   cuisine    cuisine     slug[]    cuisine_slugs    (both) -- ANY of
 *   diet       diet        slug[]    diet_slugs       (both) -- ALL of
 *   exclude    exclude     slug[]    exclude_allergen_slugs (both) -- NONE of
 *   spiceMax   spiceMax    0..4      max_spice        (both)
 *   calMin     calMin      number    min_calories     (both)
 *   calMax     calMax      number    max_calories     (both)
 *   proteinMin proteinMin  number    min_protein_g    (both)
 *   cursor     cursor      string    opaque; search: "score:uuid", matcher: base64url
 *
 * Multi-value params are comma-separated (`diet=vegan,gluten-free`) -- one key,
 * so URLs stay short and a chip toggle is a single replace.
 *
 * CONTRACT FOR THE MATCHER-QUALITY LANE. `match_recipes` WILL accept these
 * trailing DEFAULT NULL parameters (appended after the cursor args, per the
 * "Extensibility" note in 20261009110000_pantry_matcher.sql), with the same
 * names and semantics `search_recipes` already has:
 *
 *   max_total_min integer, cuisine_slugs text[], diet_slugs text[],
 *   exclude_allergen_slugs text[], max_spice smallint,
 *   min_calories numeric, max_calories numeric, min_protein_g numeric
 *
 * `search_recipes` gains no new parameters (all of the above already exist);
 * it only changes to the NULL semantics below. `matchRecipes` passes them
 * through in buildMatchArgs.
 *
 * -- NULL SEMANTICS (both RPCs, every range filter) -----------------------------
 * Most of the catalog is USDA MyPlate, which publishes no cook time, often no
 * spice level and sometimes no calories. A range filter must therefore NOT drop
 * unknowns: a recipe whose time / spice / calories is unknown PASSES the filter,
 * and in ordering sorts AFTER recipes whose value is known and in range.
 *   - time:     total_time_min IS NULL or = 0 means unknown (0 is how the
 *               importer stored "no time"; match_recipes already maps it to
 *               time_key = 2147483647).  Pass if unknown OR <= max_total_min.
 *   - spice:    spice_level IS NULL passes max_spice.
 *   - calories: calories IS NULL passes min_calories / max_calories.
 *   - protein:  protein_g IS NULL passes min_protein_g.
 * Today search_recipes uses a bare `col <= x`, which silently drops NULLs; the
 * matcher-quality lane fixes that in a new migration. Allergen and diet filters
 * are NOT range filters; they keep their own ANY/ALL/NONE rules.
 */

export type RecipeFilters = {
  /** Search text (door 2). */
  q?: string;
  /** Canonical ingredient ids in the pantry (door 1). */
  pantry?: number[];
  /** Ingredient ids every result must use ("use it up"). */
  use?: number[];
  /** Matcher only: show recipes missing at most this many. */
  maxMissing?: number;
  /** Total minutes, upper bound. Unknown-time recipes pass. */
  maxTime?: number;
  /** Cuisine slugs; recipe matches ANY. */
  cuisine?: string[];
  /** Diet slugs; recipe must carry ALL. */
  diet?: string[];
  /** Allergen slugs; recipe must carry NONE. */
  exclude?: string[];
  /** 0..4, upper bound. Unknown spice passes. */
  spiceMax?: number;
  calMin?: number;
  calMax?: number;
  proteinMin?: number;
  /** Opaque keyset cursor from the previous page's `nextCursor`. */
  cursor?: string;
};

/** Exact URL param names, in canonical serialization order. */
export const FILTER_PARAMS = [
  "q",
  "pantry",
  "use",
  "maxMissing",
  "maxTime",
  "cuisine",
  "diet",
  "exclude",
  "spiceMax",
  "calMin",
  "calMax",
  "proteinMin",
  "cursor",
] as const satisfies readonly (keyof RecipeFilters)[];

/** What Next's `await searchParams` (or `URLSearchParams`) hands us. */
export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

const MAX_LIST = 50;
const MAX_Q = 200;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

function first(sp: SearchParamsInput, key: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function num(raw: string | undefined, min: number, max: number): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, min), max);
}

function int(raw: string | undefined, min: number, max: number): number | undefined {
  const n = num(raw, min, max);
  return n === undefined ? undefined : Math.trunc(n);
}

function idList(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, MAX_LIST);
  return ids.length ? ids : undefined;
}

function slugList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const slugs = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => SLUG.test(s)),
    ),
  ].slice(0, MAX_LIST);
  return slugs.length ? slugs : undefined;
}

/**
 * URL -> filters. Total: malformed or out-of-range values are dropped or
 * clamped, never thrown, because the input is user-editable.
 */
export function parseFilters(sp: SearchParamsInput): RecipeFilters {
  const q = first(sp, "q")?.trim().slice(0, MAX_Q);
  const cursor = first(sp, "cursor")?.slice(0, 512);
  const out: RecipeFilters = {
    q: q || undefined,
    pantry: idList(first(sp, "pantry")),
    use: idList(first(sp, "use")),
    maxMissing: int(first(sp, "maxMissing"), 0, 10),
    maxTime: int(first(sp, "maxTime"), 1, 1440),
    cuisine: slugList(first(sp, "cuisine")),
    diet: slugList(first(sp, "diet")),
    exclude: slugList(first(sp, "exclude")),
    spiceMax: int(first(sp, "spiceMax"), 0, 4),
    calMin: num(first(sp, "calMin"), 0, 10000),
    calMax: num(first(sp, "calMax"), 0, 10000),
    proteinMin: num(first(sp, "proteinMin"), 0, 1000),
    cursor: cursor || undefined,
  };
  // Drop undefined keys so equality checks and spreads behave.
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as RecipeFilters;
}

/** filters -> URLSearchParams, canonical order, only set values. */
export function serializeFilters(f: RecipeFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of FILTER_PARAMS) {
    const v = f[key];
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(key, v.join(","));
    } else {
      sp.set(key, String(v));
    }
  }
  return sp;
}

/** `"?diet=vegan&maxTime=30"`, or `""` when nothing is set. Append to a path. */
export function filtersToQuery(f: RecipeFilters): string {
  // Commas are legal in a query string; keep lists readable (`diet=a,b`).
  const s = serializeFilters(f).toString().replaceAll("%2C", ",");
  return s ? `?${s}` : "";
}

/**
 * Apply a change and reset paging: any filter change invalidates the cursor.
 * Pass `undefined` (or `[]`) for a key to clear it. Pass `cursor` in `patch`
 * to move to a specific page.
 */
export function withFilters(
  f: RecipeFilters,
  patch: Partial<RecipeFilters>,
): RecipeFilters {
  return parseFilters(serializeFilters({ ...f, cursor: undefined, ...patch }));
}

/** Toggle one value in a multi-value filter (diet / cuisine / exclude). */
export function toggleInList(
  f: RecipeFilters,
  key: "cuisine" | "diet" | "exclude",
  slug: string,
): RecipeFilters {
  const cur = f[key] ?? [];
  const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
  return withFilters(f, { [key]: next });
}

/** True when any narrowing filter (not q / pantry / cursor) is set. */
export function hasActiveFilters(f: RecipeFilters): boolean {
  return (
    f.maxTime !== undefined ||
    f.spiceMax !== undefined ||
    f.calMin !== undefined ||
    f.calMax !== undefined ||
    f.proteinMin !== undefined ||
    !!f.cuisine?.length ||
    !!f.diet?.length ||
    !!f.exclude?.length
  );
}

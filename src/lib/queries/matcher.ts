import type { RecipeFilters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";

/**
 * Pantry matcher (M3.3) -- typed wrappers over two Postgres functions.
 *
 * All ranking happens in `match_recipes` and all candidate scoring in
 * `suggest_ingredients`; this file only shapes arguments and results. Per
 * CLAUDE.md there is no inline Supabase call in a component -- UI code imports
 * from here.
 */

/** One recipe in a match result, already ranked and annotated. */
export type PantryMatch = {
  recipeId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  servings: number;
  /** `null` when unknown (most USDA MyPlate recipes carry no times). */
  totalTimeMin: number | null;
  calories: number | null;
  /** Needed ingredients the pantry covers. */
  haveCount: number;
  /** Non-staple, non-optional ingredients the recipe calls for. */
  neededCount: number;
  missingCount: number;
  /** haveCount / neededCount, 0..1, rounded to 4 dp. */
  coverage: number;
  missingIngredientIds: number[];
  /** Canonical names, alphabetical -- ready for "you're missing: ...". */
  missingNames: string[];
};

export type MatchRecipesResult = {
  matches: PantryMatch[];
  /** Pass back as `cursor` for the next page; `null` on the last page. */
  nextCursor: string | null;
};

/** One autocomplete suggestion. */
export type IngredientSuggestion = {
  ingredientId: number;
  canonicalName: string;
  /** The name or alias the typed text matched ("green onion" for scallion). */
  matchedText: string;
  matchKind: "name" | "alias";
};

type MatchRpcRow = {
  recipe_id: string;
  slug: string;
  title: string;
  image_url: string | null;
  servings: number;
  total_time_min: number | null;
  calories: number | null;
  have_count: number;
  needed_count: number;
  missing_count: number;
  coverage: number;
  missing_ids: number[];
  missing_names: string[];
  time_key: number;
};

type SuggestRpcRow = {
  ingredient_id: number;
  canonical_name: string;
  matched_text: string;
  match_kind: "name" | "alias";
};

// -- cursor -----------------------------------------------------------------
//
// Keyset pagination: the cursor is the last row's sort key, not a row number.
// It travels in the URL (`?cursor=`), which is user-controlled input, so decode
// is strict and a malformed cursor means "start from the top", never an error
// page and never something forwarded to Postgres unchecked.

type Cursor = {
  coverage: number;
  have: number;
  timeKey: number;
  recipeId: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.coverage, c.have, c.timeKey, c.recipeId])).toString(
    "base64url",
  );
}

function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [coverage, have, timeKey, recipeId] = parsed;
    if (
      typeof coverage !== "number" ||
      !Number.isFinite(coverage) ||
      !Number.isInteger(have) ||
      !Number.isInteger(timeKey) ||
      typeof recipeId !== "string" ||
      !UUID.test(recipeId)
    ) {
      return null;
    }
    return { coverage, have, timeKey, recipeId };
  } catch {
    return null;
  }
}

/**
 * Maps the shared RecipeFilters to `match_recipes` arguments (the M3.4 filters
 * are the trailing parameters; names mirror `search_recipes`). Unset filters are
 * omitted, never sent as null, so PostgREST applies the SQL defaults. Exported
 * for testing.
 */
export function buildMatchArgs(
  filters: RecipeFilters,
  input: {
    pantryIds: number[];
    mustUseIds: number[];
    pageSize: number;
    minHave?: number;
    cursor: Cursor | null;
  },
) {
  const { cursor } = input;
  return {
    pantry_ids: input.pantryIds,
    max_missing: Math.max(Math.trunc(filters.maxMissing ?? 3), 0),
    must_use_ids: input.mustUseIds,
    min_have: Math.max(Math.trunc(input.minHave ?? 1), 1),
    page_size: input.pageSize,
    ...(cursor
      ? {
          cursor_coverage: cursor.coverage,
          cursor_have: cursor.have,
          cursor_time_key: cursor.timeKey,
          cursor_recipe_id: cursor.recipeId,
        }
      : {}),
    ...(filters.maxTime !== undefined ? { max_total_min: filters.maxTime } : {}),
    ...(filters.cuisine?.length ? { cuisine_slugs: filters.cuisine } : {}),
    ...(filters.diet?.length ? { diet_slugs: filters.diet } : {}),
    ...(filters.exclude?.length ? { exclude_allergen_slugs: filters.exclude } : {}),
    ...(filters.spiceMax !== undefined ? { max_spice: filters.spiceMax } : {}),
    ...(filters.calMin !== undefined ? { min_calories: filters.calMin } : {}),
    ...(filters.calMax !== undefined ? { max_calories: filters.calMax } : {}),
    ...(filters.proteinMin !== undefined ? { min_protein_g: filters.proteinMin } : {}),
  };
}

function cleanIds(ids: number[] | undefined): number[] {
  return [...new Set((ids ?? []).filter((n) => Number.isInteger(n) && n > 0))];
}

/**
 * Rank published recipes by how little the pantry lacks.
 *
 * Staples (salt, oil, butter...) and optional ingredients never count as
 * missing -- that rule lives in the SQL, once. Order is coverage, then more
 * pantry ingredients used, then shorter total time.
 *
 * Ingredient families apply in SQL: a parent in the pantry ("onion") covers its
 * variants ("yellow onion") and a variant covers a recipe that names the parent;
 * a sibling does not. The M3.4 filters (time, cuisine, diet, allergens, spice,
 * calories, protein) are ANDed in the same query; unknown time/spice/calories/
 * protein pass range filters.
 *
 * An empty pantry returns nothing rather than the whole catalog: "what can I
 * make with nothing" has no useful answer, and the browse page is for that.
 */
export async function matchRecipes(
  filters: RecipeFilters,
  options: { pageSize?: number; minHave?: number } = {},
): Promise<MatchRecipesResult> {
  const pantryIds = cleanIds(filters.pantry);
  const mustUseIds = cleanIds(filters.use);
  if (pantryIds.length === 0 && mustUseIds.length === 0) {
    return { matches: [], nextCursor: null };
  }

  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 24), 1), 99);
  const cursor = decodeCursor(filters.cursor);

  // Ask for one extra row: if it comes back, there is a next page.
  const args = buildMatchArgs(filters, {
    pantryIds,
    mustUseIds,
    pageSize: pageSize + 1,
    minHave: options.minHave,
    cursor,
  });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "match_recipes",
    args,
  );
  if (error) throw error;
  const rows = (data ?? []) as MatchRpcRow[];

  const page = rows.slice(0, pageSize);
  const last = page.at(-1);

  return {
    matches: page.map((row) => ({
      recipeId: row.recipe_id,
      slug: row.slug,
      title: row.title,
      imageUrl: row.image_url,
      servings: row.servings,
      totalTimeMin: row.total_time_min === 0 ? null : row.total_time_min,
      calories: row.calories,
      haveCount: row.have_count,
      neededCount: row.needed_count,
      missingCount: row.missing_count,
      coverage: Number(row.coverage),
      missingIngredientIds: row.missing_ids,
      missingNames: row.missing_names,
    })),
    nextCursor:
      rows.length > pageSize && last
        ? encodeCursor({
            coverage: Number(last.coverage),
            have: last.have_count,
            timeKey: last.time_key,
            recipeId: last.recipe_id,
          })
        : null,
  };
}

/**
 * Autocomplete for the pantry input: top `limit` ingredients whose name or
 * alias matches what has been typed so far ("green oni" offers scallion,
 * "chicken" offers chicken before chicken broth).
 *
 * Not `resolveIngredient`: that returns one confident answer for the import
 * gate; this returns several plausible ones for a dropdown.
 */
export async function suggestIngredients(
  prefix: string,
  limit = 8,
): Promise<IngredientSuggestion[]> {
  const text = prefix.trim();
  if (text.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suggest_ingredients", {
    prefix: text,
    max_results: Math.min(Math.max(Math.trunc(limit), 1), 25),
  });
  if (error) throw error;
  const rows = (data ?? []) as SuggestRpcRow[];

  return rows.map((row) => ({
    ingredientId: row.ingredient_id,
    canonicalName: row.canonical_name,
    matchedText: row.matched_text,
    matchKind: row.match_kind,
  }));
}

import { unstable_cache } from "next/cache";

import { MAX_INT4, resultFilters, type RecipeFilters } from "@/lib/filters";
import { createStaticClient } from "@/lib/supabase/static";

/**
 * The fridge door (wave 10c): a typed wrapper over `fridge_recipes_grouped`.
 *
 * It answers "what can I cook with what I have?" in four groups, decided in SQL:
 *   now       every required, non-staple, non-optional ingredient is on hand
 *   missing1  exactly one is missing
 *   missing2  exactly two
 *   more      three or more
 * Inside a group, recipes that use the soonest-expiring fridge items come first, then the
 * matcher's usual order. Staples (salt, oil, ...) and optional lines never count as missing;
 * that rule lives in the SQL once, shared with match_recipes.
 *
 * `match_recipes` itself is untouched (the pantry search on /recipes keeps using it).
 */

export type FridgeGroupId = "now" | "missing1" | "missing2" | "more";

export const FRIDGE_GROUPS: readonly FridgeGroupId[] = ["now", "missing1", "missing2", "more"];

export type FridgeMatch = {
  recipeId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  servings: number;
  /** `null` when unknown. */
  totalTimeMin: number | null;
  calories: number | null;
  haveCount: number;
  neededCount: number;
  missingCount: number;
  missingIds: number[];
  /** Canonical names, alphabetical; position n is the name of `missingIds[n]`. */
  missingNames: string[];
  group: FridgeGroupId;
  /** Days until the soonest-expiring fridge item the recipe uses (negative = past its date), or null. */
  soonDay: number | null;
};

export type FridgeGroupPage = {
  /** The group's full size, whatever page this is. */
  total: number;
  matches: FridgeMatch[];
  /** Pass back as `cursor` for the next page of THIS group; `null` on the last page. */
  nextCursor: string | null;
};

/** A fridge item due soon: the ingredient id and its days until expiry (negative = already past). */
export type SoonItem = { id: number; days: number };

type Row = {
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
  grp: FridgeGroupId;
  group_total: number;
  soon_day: number | null;
  soon_key: number;
};

// -- cursor (per group): the last row's whole sort key ------------------------------------------

type Cursor = { soon: number; coverage: number; have: number; timeKey: number; recipeId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.soon, c.coverage, c.have, c.timeKey, c.recipeId])).toString("base64url");
}

/** The cursor travels in the URL, so decoding is strict: anything odd means "from the top". */
export function decodeFridgeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 5) return null;
    const [soon, coverage, have, timeKey, recipeId] = parsed;
    if (
      !Number.isInteger(soon) ||
      typeof coverage !== "number" ||
      !Number.isFinite(coverage) ||
      !Number.isInteger(have) ||
      !Number.isInteger(timeKey) ||
      typeof recipeId !== "string" ||
      !UUID.test(recipeId)
    ) {
      return null;
    }
    return { soon, coverage, have, timeKey, recipeId };
  } catch {
    return null;
  }
}

function cleanIds(ids: number[] | undefined): number[] {
  return [...new Set((ids ?? []).filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_INT4))];
}

/** The filter arguments `fridge_recipes_grouped` shares with `match_recipes` (same names). Unset filters are omitted. */
export function buildFridgeFilterArgs(filters: RecipeFilters) {
  return {
    ...(filters.minTime !== undefined ? { min_total_min: filters.minTime } : {}),
    ...(filters.maxTime !== undefined ? { max_total_min: filters.maxTime } : {}),
    ...(filters.include?.length ? { include_ingredient_ids: filters.include } : {}),
    ...(filters.cuisine?.length ? { cuisine_slugs: filters.cuisine } : {}),
    ...(filters.diet?.length ? { diet_slugs: filters.diet } : {}),
    ...(filters.exclude?.length ? { exclude_allergen_slugs: filters.exclude } : {}),
    ...(filters.cookware?.length ? { cookware_slugs: filters.cookware } : {}),
    ...(filters.ownedOnly ? { owned_cookware_slugs: filters.ownedCookware ?? [] } : {}),
    ...(filters.spiceMax !== undefined ? { max_spice: filters.spiceMax } : {}),
    ...(filters.calMin !== undefined ? { min_calories: filters.calMin } : {}),
    ...(filters.calMax !== undefined ? { max_calories: filters.calMax } : {}),
    ...(filters.proteinMin !== undefined ? { min_protein_g: filters.proteinMin } : {}),
  };
}

function toMatch(row: Row): FridgeMatch {
  return {
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
    missingIds: row.missing_ids,
    missingNames: row.missing_names,
    group: row.grp,
    soonDay: row.soon_day,
  };
}

type LooseRpc = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

type Query = {
  filters: RecipeFilters;
  pantryIds: number[];
  soon: SoonItem[];
  /** Omit for the first rows of every group; set for one group's pages. */
  group?: FridgeGroupId;
  perGroup?: number;
  pageSize?: number;
};

async function loadGroups(q: Query): Promise<Record<FridgeGroupId, FridgeGroupPage>> {
  const empty = (): FridgeGroupPage => ({ total: 0, matches: [], nextCursor: null });
  const out: Record<FridgeGroupId, FridgeGroupPage> = {
    now: empty(),
    missing1: empty(),
    missing2: empty(),
    more: empty(),
  };
  const pantryIds = cleanIds(q.pantryIds);
  if (pantryIds.length === 0) return out;

  const soon = q.soon.filter((s) => Number.isInteger(s.id) && s.id > 0 && s.id <= MAX_INT4 && Number.isInteger(s.days));
  const perGroup = Math.min(Math.max(Math.trunc(q.perGroup ?? 12), 1), 50);
  const cursor = q.group ? decodeFridgeCursor(q.filters.cursor) : null;
  const pageSize = Math.min(Math.max(Math.trunc(q.pageSize ?? 24), 1), 99);

  // Not in the generated types until `pnpm db:types` runs at integration, so the client is widened here.
  const supabase = createStaticClient() as unknown as LooseRpc;
  const { data, error } = await supabase.rpc("fridge_recipes_grouped", {
    pantry_ids: pantryIds,
    soon_ids: soon.map((s) => s.id),
    soon_days: soon.map((s) => s.days),
    ...(q.group
      ? { group_filter: q.group, page_size: pageSize + 1 }
      : { per_group: perGroup }),
    ...(cursor
      ? {
          cursor_soon: cursor.soon,
          cursor_coverage: cursor.coverage,
          cursor_have: cursor.have,
          cursor_time_key: cursor.timeKey,
          cursor_recipe_id: cursor.recipeId,
        }
      : {}),
    ...buildFridgeFilterArgs(q.filters),
  });
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  if (q.group) {
    const page = rows.slice(0, pageSize);
    const last = page.at(-1);
    out[q.group] = {
      total: rows[0]?.group_total ?? 0,
      matches: page.map(toMatch),
      nextCursor:
        rows.length > pageSize && last
          ? encodeCursor({
              soon: last.soon_key,
              coverage: Number(last.coverage),
              have: last.have_count,
              timeKey: last.time_key,
              recipeId: last.recipe_id,
            })
          : null,
    };
    return out;
  }

  for (const row of rows) {
    const g = out[row.grp];
    g.total = row.group_total;
    g.matches.push(toMatch(row));
  }
  // The first rows of a group have a next page when the group is bigger than what we hold.
  for (const id of FRIDGE_GROUPS) {
    const g = out[id];
    const last = rows.filter((r) => r.grp === id).at(-1);
    if (last && g.total > g.matches.length) {
      g.nextCursor = encodeCursor({
        soon: last.soon_key,
        coverage: Number(last.coverage),
        have: last.have_count,
        timeKey: last.time_key,
        recipeId: last.recipe_id,
      });
    }
  }
  return out;
}

/**
 * Cached 5 minutes per (filters, fridge, expiring items): the same inputs give the same answer, and the
 * answer holds nothing private (ids in, public recipes out). Cookie-free client, as `unstable_cache` needs.
 */
const cachedGroups = unstable_cache(loadGroups, ["fridge-recipes-grouped"], { revalidate: 300 });

/** The first rows of every group, with each group's full size. */
export function fridgeGroups(
  filters: RecipeFilters,
  pantryIds: number[],
  soon: SoonItem[],
  perGroup = 12,
): Promise<Record<FridgeGroupId, FridgeGroupPage>> {
  return cachedGroups({ filters: resultFilters({ ...filters, cursor: undefined }), pantryIds, soon, perGroup });
}

/** One group, keyset-paginated: pass the page's own `nextCursor` back as `filters.cursor`. */
export async function fridgeGroupPage(
  filters: RecipeFilters,
  pantryIds: number[],
  soon: SoonItem[],
  group: FridgeGroupId,
  pageSize = 24,
): Promise<FridgeGroupPage> {
  const all = await cachedGroups({ filters: resultFilters(filters), pantryIds, soon, group, pageSize });
  return all[group];
}

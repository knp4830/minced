import { createClient } from "@/lib/supabase/server";

/** How `resolve_ingredient` reached its answer. Mirrors the Postgres enum. */
export type IngredientMatchKind = "exact" | "alias" | "fuzzy";

export type ResolvedIngredient = {
  ingredientId: number;
  canonicalName: string;
  matchKind: IngredientMatchKind;
  confidence: number;
};

/** One input name and what became of it. `null` means nothing matched. */
export type IngredientCoverageRow = {
  rawName: string;
  resolved: ResolvedIngredient | null;
};

type CoverageRpcRow = {
  raw_name: string;
  ingredient_id: number | null;
  canonical_name: string | null;
  match_kind: IngredientMatchKind | null;
  confidence: number | null;
};

/**
 * Resolve one free-text ingredient name to a canonical ingredient.
 *
 * Returns `null` when nothing clears the confidence threshold. That `null` is
 * the "unresolved" signal, and per CLAUDE.md an importer must **reject** the
 * recipe on it rather than warn — an unresolved ingredient throws no error, it
 * just silently stops matching, and a catalog degrades one invisible row at a
 * time.
 *
 * The matching itself is a Postgres function (`resolve_ingredient`) called by
 * RPC, not logic assembled here. Fuzzy matching in TypeScript would mean
 * fetching all ~400 ingredients and scoring them in Node on every keystroke;
 * pg_trgm scores them against a GIN index next to the data and returns one row.
 */
export async function resolveIngredient(
  rawName: string,
  minSimilarity?: number,
): Promise<ResolvedIngredient | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("resolve_ingredient", {
      raw_name: rawName,
      ...(minSimilarity !== undefined ? { min_similarity: minSimilarity } : {}),
    })
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ingredientId: data.ingredient_id,
    canonicalName: data.canonical_name,
    matchKind: data.match_kind,
    confidence: data.confidence,
  };
}

/**
 * Resolve a batch and **keep the misses**.
 *
 * One round trip for the whole list rather than one per name, and — the part
 * that matters — unresolved names come back as rows with `resolved: null`
 * instead of disappearing. A batch resolver that silently drops what it cannot
 * match reports 100% coverage forever.
 *
 * Two callers: the import gate (reject any recipe with a `null`) and the
 * coverage report (which misses are worth curating an alias for).
 */
export async function getIngredientCoverage(
  rawNames: string[],
  minSimilarity?: number,
): Promise<IngredientCoverageRow[]> {
  if (rawNames.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("ingredient_coverage", {
    raw_names: rawNames,
    ...(minSimilarity !== undefined ? { min_similarity: minSimilarity } : {}),
  });

  if (error) throw error;

  return ((data ?? []) as CoverageRpcRow[]).map((row) => ({
    rawName: row.raw_name,
    resolved:
      row.ingredient_id === null ||
      row.canonical_name === null ||
      row.match_kind === null ||
      row.confidence === null
        ? null
        : {
            ingredientId: row.ingredient_id,
            canonicalName: row.canonical_name,
            matchKind: row.match_kind,
            confidence: row.confidence,
          },
  }));
}

/**
 * Every name that failed to resolve. The import gate's actual question.
 *
 * Empty array means the recipe may be imported; anything else means reject it
 * and name the offending lines.
 */
export async function getUnresolvedIngredientNames(
  rawNames: string[],
  minSimilarity?: number,
): Promise<string[]> {
  const coverage = await getIngredientCoverage(rawNames, minSimilarity);
  return coverage.filter((row) => row.resolved === null).map((row) => row.rawName);
}

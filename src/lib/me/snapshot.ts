import { MACRO_COLUMNS, MIN_COVERAGE, isAddedSugar, type Nutrient } from "@/lib/nutrients";

/* Pure (no I/O) so scripts/test-me.mts can run it. */

type SnapshotRow = { nutrient: Nutrient; amount: number | null; coverage: number };
const MACRO_FDC: ReadonlySet<number> = new Set(MACRO_COLUMNS.map((m) => m.fdc));

/**
 * The rows of a recipe that Me may add up: exactly the nutrients the recipe page's label shows as a number
 * (src/lib/recipeLabel.ts). Not a macro column; at least MIN_COVERAGE of the counted mass reports it (added
 * sugars, an estimate, only need some); and on a partial recipe a zero is "unknown", never a clean 0.
 * A nutrient left out here is "not reported" on the diary row, so Me shows "at least" instead of a number the
 * recipe page itself withholds.
 */
export function snapshotFromRows(rows: readonly SnapshotRow[], partial: boolean): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const r of rows) {
    // The six macro columns on the diary row are the source of truth for those (they carry the published
    // value); repeating a computed copy here would let two numbers for the same thing drift apart.
    if (r.nutrient.fdcNumber !== null && MACRO_FDC.has(r.nutrient.fdcNumber)) continue;
    if (r.nutrient.displayGroup === "hidden") continue;
    if (r.amount === null || r.coverage <= 0) continue;
    if (isAddedSugar(r.nutrient)) {
      out[r.nutrient.key] = r.amount;
      continue;
    }
    if (r.coverage < MIN_COVERAGE || (partial && r.amount <= 0)) continue;
    out[r.nutrient.key] = r.amount;
  }
  return Object.keys(out).length > 0 ? out : null;
}

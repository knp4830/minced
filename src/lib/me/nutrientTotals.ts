import {
  FALLBACK_NUTRIENTS,
  FDC,
  LABEL_TOP,
  LIMIT_FDC,
  bySort,
  inLabelTop,
  percentDv,
  type Nutrient,
} from "@/lib/nutrients";
import type { DvBasis, PersonalDv } from "@/lib/me/dailyValues";
import type { FoodEntry } from "@/lib/me/types";

/*
 * "All nutrients today": adds up every logged entry, per nutrient, against the FDA Daily Value from the
 * `nutrients` table (this replaces the old hard-coded dv.ts).
 *
 * Where each number comes from:
 *   - protein, carbs, fat, fiber, sodium: the dedicated columns on the diary row (quick adds fill these
 *     too, and a quick add can leave fiber or sodium unknown);
 *   - every other nutrient: the per-nutrient snapshot frozen on the row when a recipe or food was logged
 *     (`FoodEntry.nutrients`, keyed by nutrient `key`).
 *
 * Missing is not zero. An entry that does not report a nutrient adds nothing to its total and is counted,
 * so the panel can say "at least" instead of presenting a low number as the truth.
 *
 * Daily Values: personal when the caller passes `dvs` (see dailyValues.ts: targets for macros, DRIs by sex and age
 * for vitamins and minerals), otherwise the FDA label value from the `nutrients` table.
 *
 * Rows: only nutrients the recipe page would also show. The snapshot frozen on a diary row already leaves out a
 * nutrient whose coverage is under MIN_COVERAGE (see getRecipeNutrientSnapshot), and rows in the hidden group
 * (Atwater and IU conversion values) never appear.
 */

export type NutrientLine = {
  id: number;
  key: string;
  name: string;
  unit: string;
  /** Sum over entries that report it; null when no entry does. */
  amount: number | null;
  /** Entries that report this nutrient / entries that do not. */
  reported: number;
  missing: number;
  dv: number | null;
  pct: number | null;
  limit: boolean;
  /** A limit nutrient past 100%. */
  over: boolean;
  /** Some entries did not report it, so the total is a lower bound. */
  partial: boolean;
  /** Where `dv` came from (a target, a DRI, the FDA label); null when the nutrient has no daily value. */
  basis: DvBasis | null;
  /** "top" = fats, cholesterol, sodium, carbohydrate, protein; "micro" = vitamins and minerals. */
  group: "top" | "micro";
  /** Label indent for a part of a total (saturated fat under total fat). */
  indent: 0 | 1 | 2;
};

/** Diary-row columns that carry a nutrient directly. Calories are shown elsewhere on the page. */
const COLUMN: Record<number, (e: FoodEntry) => number | null> = {
  [FDC.protein]: (e) => e.proteinG,
  [FDC.carbs]: (e) => e.carbsG,
  [FDC.fat]: (e) => e.fatG,
  [FDC.fiber]: (e) => e.fiberG,
  [FDC.sodium]: (e) => e.sodiumMg,
};

const topIndex = (n: Nutrient) => LABEL_TOP.findIndex((t) => t.fdc === n.fdcNumber);

export function dayNutrientLines(entries: readonly FoodEntry[], nutrientList: readonly Nutrient[], dvs?: ReadonlyMap<string, PersonalDv>): NutrientLine[] {
  const list = (nutrientList.length > 0 ? nutrientList : FALLBACK_NUTRIENTS).filter((n) => n.fdcNumber !== FDC.energy && n.displayGroup !== "hidden");
  const ordered = [...list].sort((a, b) => {
    const ta = inLabelTop(a);
    const tb = inLabelTop(b);
    if (ta && tb) return topIndex(a) - topIndex(b);
    if (ta !== tb) return ta ? -1 : 1;
    return bySort(a, b);
  });

  const out: NutrientLine[] = [];
  for (const n of ordered) {
    const fromColumn = n.fdcNumber !== null ? COLUMN[n.fdcNumber] : undefined;
    let sum = 0;
    let reported = 0;
    let missing = 0;
    for (const e of entries) {
      const v = fromColumn ? fromColumn(e) : (e.nutrients?.[n.key] ?? null);
      if (v === null || v === undefined || !Number.isFinite(v)) missing++;
      else {
        sum += v;
        reported++;
      }
    }
    const amount = reported > 0 ? sum : null;
    // Round the %DV once, here, so the number shown is the number the "over" decision used.
    const personal = dvs?.get(n.key);
    const dvAmount = dvs ? (personal?.amount ?? null) : n.dvAmount;
    const pct = amount === null ? null : percentDv(amount, { ...n, dvAmount });
    const limit = n.fdcNumber !== null && LIMIT_FDC.has(n.fdcNumber);
    out.push({
      id: n.id,
      key: n.key,
      name: n.name,
      unit: n.unit,
      amount,
      reported,
      missing,
      dv: dvAmount,
      basis: dvs ? (personal?.basis ?? null) : dvAmount !== null ? "fda" : null,
      group: inLabelTop(n) ? "top" : "micro",
      indent: LABEL_TOP.find((t) => t.fdc === n.fdcNumber)?.indent ?? 0,
      pct,
      limit,
      over: limit && pct !== null && pct > 100,
      partial: reported > 0 && missing > 0,
    });
  }
  return out;
}

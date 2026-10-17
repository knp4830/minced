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
 * Daily Values: FDA adult values for now (sex- and age-specific values are an open question for the owner).
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

export function dayNutrientLines(entries: readonly FoodEntry[], nutrientList: readonly Nutrient[]): NutrientLine[] {
  const list = (nutrientList.length > 0 ? nutrientList : FALLBACK_NUTRIENTS).filter((n) => n.fdcNumber !== FDC.energy);
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
    const pct = amount === null ? null : percentDv(amount, n);
    const limit = n.fdcNumber !== null && LIMIT_FDC.has(n.fdcNumber);
    out.push({
      id: n.id,
      key: n.key,
      name: n.name,
      unit: n.unit,
      amount,
      reported,
      missing,
      dv: n.dvAmount,
      pct,
      limit,
      over: limit && pct !== null && pct > 100,
      partial: reported > 0 && missing > 0,
    });
  }
  return out;
}

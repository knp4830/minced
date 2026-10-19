import {
  FALLBACK_NUTRIENTS,
  FDC,
  LABEL_TOP,
  LIMIT_FDC,
  MACRO_COLUMNS,
  MIN_COVERAGE,
  bySort,
  byFdc,
  formatAmount,
  inLabelTop,
  isAddedSugar,
  percentDv,
  roundForLabel,
  type Nutrient,
} from "@/lib/nutrients";
import type { RecipeNutrients } from "@/lib/queries/recipeNutrients";

/*
 * Turns what the database holds for one recipe into the rows a Nutrition Facts label shows. Pure, so the
 * rules are unit-tested (scripts/test-nutrients.mts) instead of living inside JSX.
 *
 * Rules (owner-approved defaults, docs/research/wave10-micronutrients-plan.md section 7):
 *   - The six macro columns on `recipes` (USDA MyPlate's published values for most recipes) win over a
 *     computed number for the same nutrient; they are never "at least".
 *   - A computed value on a partial recipe is "at least": uncounted ingredients can only add to it.
 *   - A micronutrient is shown only when at least MIN_COVERAGE of the counted ingredient mass reports it,
 *     otherwise it is listed as "not enough data" so nothing is silently shown as zero.
 *   - Missing is not zero: a nutrient nobody reports has no row.
 *   - Added sugars exist only as an estimate (a curated list of added-sugar ingredients) and say so.
 */

export type Columns = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
};

const COLUMN_VALUE: Record<(typeof MACRO_COLUMNS)[number]["column"], keyof Columns> = {
  calories: "calories",
  protein_g: "proteinG",
  carbs_g: "carbsG",
  fat_g: "fatG",
  fiber_g: "fiberG",
  sodium_mg: "sodiumMg",
};

export type LabelRow = {
  fdc: number | null;
  name: string;
  /** "310 mg". Empty when `noData`. */
  amountText: string;
  amount: number | null;
  pct: number | null;
  indent: 0 | 1 | 2;
  bold: boolean;
  /** Computed on a partial recipe: the true value is at least this. */
  atLeast: boolean;
  estimated: boolean;
  /** Coverage too low to show a number. */
  noData: boolean;
  limit: boolean;
};

export type LabelModel = {
  calories: { amount: number; text: string; atLeast: boolean } | null;
  top: LabelRow[];
  micro: LabelRow[];
  /** Where the numbers came from, to word the footnote honestly. */
  basis: "published" | "computed" | "published+computed" | "none";
  /**
   * Who published the macro columns, for the footnote. "usda_myplate" only when the database says the recipe is a
   * USDA MyPlate import; a recipe we computed, or one whose source is not recorded, never credits MyPlate.
   */
  publishedBy: "usda_myplate" | "other";
  partial: boolean;
  unavailable: boolean;
  /**
   * True when a computed fat or sugar breakdown was left out because it cannot be reconciled with the
   * published total next to it (for example 6 g of unsaturated fat under a published 3.5 g of total fat).
   */
  breakdownHidden: boolean;
  /**
   * Set when the published calories and the calories computed from the ingredients differ by more than
   * DISAGREE_THRESHOLD (a fraction, signed: positive = computed is higher). Only for USDA MyPlate recipes.
   */
  disagreement: number | null;
};

/** Owner-approved: flag a published-vs-computed calorie disagreement above 20 percent. */
export const DISAGREE_THRESHOLD = 0.2;

type Found = { amount: number; computed: boolean; coverage: number };

export function buildLabel(columns: Columns, data: RecipeNutrients | null, nutrientList: readonly Nutrient[]): LabelModel {
  const list = nutrientList.length > 0 ? nutrientList : FALLBACK_NUTRIENTS;
  const unavailable = data?.status === "unavailable";
  const partial = data?.status === "partial";
  const usable = data && !unavailable ? data.rows : [];

  const byFdcRow = new Map<number, (typeof usable)[number]>();
  for (const r of usable) if (r.nutrient.fdcNumber !== null) byFdcRow.set(r.nutrient.fdcNumber, r);
  const addedRow = usable.find((r) => isAddedSugar(r.nutrient));

  const found = (fdc: number): Found | null => {
    const col = MACRO_COLUMNS.find((m) => m.fdc === fdc);
    if (col) {
      const v = columns[COLUMN_VALUE[col.column]];
      // The columns hold USDA's published value for MyPlate recipes, but refresh_recipe_nutrients() writes them
      // for the recipes it computed itself ("Minced original"): then they are computed, and a partial recipe's
      // value is "at least".
      if (v !== null && v !== undefined) return { amount: v, computed: data?.source === "computed", coverage: 1 };
    }
    const r = byFdcRow.get(fdc);
    if (r && r.amount !== null) return { amount: r.amount, computed: true, coverage: r.coverage };
    return null;
  };

  // A total sits next to separately computed parts. If the parts cannot fit inside it (a published total, or a
  // computed one for a recipe where an ingredient's fat parts and its total disagree), showing both makes the label
  // contradict itself, so the parts are left out and the label says so.
  const hidden = new Set<number>();
  const pubFat = found(FDC.fat);
  if (pubFat) {
    const parts = [FDC.satFat, FDC.transFat, FDC.monoFat, FDC.polyFat]
      .map((f) => byFdcRow.get(f)?.amount)
      .filter((v): v is number => typeof v === "number");
    const sum = parts.reduce((a, b) => a + b, 0);
    // whole grams on the label: parts may exceed the whole by half a gram of rounding, never more (a part of 0.4 g under 0.3 g shows)
    const tooBig = sum > pubFat.amount + 0.5 || parts.some((v) => v > pubFat.amount + 0.05);
    if (tooBig) for (const f of [FDC.satFat, FDC.transFat, FDC.monoFat, FDC.polyFat]) if (byFdcRow.has(f)) hidden.add(f);
  }
  const pubCarb = found(FDC.carbs);
  if (pubCarb) {
    const sugars = byFdcRow.get(FDC.sugars)?.amount;
    if (typeof sugars === "number" && sugars > pubCarb.amount + 0.5) {
      hidden.add(FDC.sugars);
      hidden.add(FDC.addedSugars);
    }
  }

  let usedPublished = false;
  let usedComputed = false;
  const note = (f: Found) => (f.computed ? (usedComputed = true) : (usedPublished = true));

  const row = (n: Nutrient, f: Found, indent: 0 | 1 | 2, bold: boolean, estimated = false): LabelRow => {
    note(f);
    const pct = percentDv(f.amount, n);
    return {
      fdc: n.fdcNumber,
      name: estimated ? `${n.name} (estimated)` : n.name,
      amountText: formatAmount(f.amount, n),
      amount: f.amount,
      pct,
      indent,
      bold,
      atLeast: f.computed && partial,
      estimated,
      noData: false,
      limit: n.fdcNumber !== null && LIMIT_FDC.has(n.fdcNumber),
    };
  };

  // Calories
  let calories: LabelModel["calories"] = null;
  const kcal = found(FDC.energy);
  if (kcal) {
    note(kcal);
    calories = { amount: roundForLabel(kcal.amount, { unit: "kcal", fdcNumber: FDC.energy }), text: String(roundForLabel(kcal.amount, { unit: "kcal", fdcNumber: FDC.energy })), atLeast: kcal.computed && partial };
  }

  // Top block
  const top: LabelRow[] = [];
  for (const t of LABEL_TOP) {
    const n = byFdc(list, t.fdc) ?? (t.fdc === FDC.addedSugars ? addedRow?.nutrient : undefined);
    if (!n) continue;
    if (hidden.has(t.fdc)) continue;
    if (t.fdc === FDC.addedSugars) {
      if (addedRow && addedRow.amount !== null && addedRow.coverage > 0) top.push(row(addedRow.nutrient, { amount: addedRow.amount, computed: true, coverage: addedRow.coverage }, t.indent, t.bold, true));
      continue;
    }
    const f = found(t.fdc);
    if (!f) continue;
    const isMacro = MACRO_COLUMNS.some((m) => m.fdc === t.fdc);
    if (f.computed && !isMacro && (f.coverage < MIN_COVERAGE || (partial && f.amount <= 0))) {
      // Saturated fat, cholesterol, sugars: same 90% rule as vitamins, and a partial recipe's zero ("at least 0") says nothing; shown as "not enough data".
      top.push({ fdc: n.fdcNumber, name: n.name, amountText: "", amount: null, pct: null, indent: t.indent, bold: t.bold, atLeast: false, estimated: false, noData: true, limit: false });
      continue;
    }
    top.push(row(n, f, t.indent, t.bold));
  }

  // Vitamins and minerals: everything else the data reports, in table order.
  const micro: LabelRow[] = [];
  const rest = usable
    .map((r) => r)
    .filter((r) => !inLabelTop(r.nutrient) && r.nutrient.fdcNumber !== FDC.energy && !isAddedSugar(r.nutrient))
    .sort((a, b) => bySort(a.nutrient, b.nutrient));
  for (const r of rest) {
    const n = r.nutrient;
    if (r.amount === null || r.coverage <= 0) continue; // nobody reports it: no row at all
    // A partial recipe's zero says nothing ("at least 0"), so it is shown as unknown, never as a clean 0.
    if (r.coverage < MIN_COVERAGE || (partial && r.amount <= 0)) {
      micro.push({ fdc: n.fdcNumber, name: n.name, amountText: "", amount: null, pct: null, indent: 0, bold: false, atLeast: false, estimated: false, noData: true, limit: false });
      continue;
    }
    usedComputed = true;
    micro.push({
      fdc: n.fdcNumber,
      name: n.name,
      amountText: formatAmount(r.amount, n),
      amount: r.amount,
      pct: percentDv(r.amount, n),
      indent: 0,
      bold: false,
      atLeast: partial,
      estimated: false,
      noData: false,
      limit: false,
    });
  }

  const basis: LabelModel["basis"] =
    usedPublished && usedComputed ? "published+computed" : usedPublished ? "published" : usedComputed ? "computed" : "none";
  const delta = data?.kcalDelta;
  const disagreement =
    !unavailable && data?.source === "usda_myplate" && typeof delta === "number" && Math.abs(delta) > DISAGREE_THRESHOLD ? delta : null;
  return { calories, top, micro, basis, publishedBy: data?.source === "usda_myplate" ? "usda_myplate" : "other", partial, unavailable, breakdownHidden: hidden.size > 0, disagreement };
}

/** Ingredient lines that did not add to the numbers, with the reason, for the "not counted" list. */
export type UncountedLine = { name: string; reason: "no data" | "to taste" | "optional" };

export function uncountedLines(
  lines: { name: string; quantity: number | null; optional: boolean }[],
  gaps: readonly string[],
): UncountedLine[] {
  const out: UncountedLine[] = [];
  const seen = new Set<string>();
  const add = (name: string, reason: UncountedLine["reason"]) => {
    const k = `${name.toLowerCase()}|${reason}`;
    if (!name || seen.has(k)) return;
    seen.add(k);
    out.push({ name, reason });
  };
  for (const g of gaps) add(g, "no data");
  const gapNames = new Set(gaps.map((g) => g.replace(/ \(.*\)$/, "").toLowerCase()));
  for (const l of lines) {
    if (l.optional) add(l.name, "optional");
    // a main ingredient with no amount is already listed as a gap ("pasta (no amount given)"), not "to taste"
    else if (l.quantity === null && !gapNames.has(l.name.toLowerCase())) add(l.name, "to taste");
  }
  return out;
}

/** Sodium is a minimum when salt (or a salty sauce) is listed "to taste", because it counts as zero. */
export function sodiumIsMinimum(lines: { name: string; quantity: number | null; optional: boolean }[]): boolean {
  return lines.some((l) => !l.optional && l.quantity === null && /\b(salt|soy sauce|fish sauce|broth|stock|bouillon|miso)\b/i.test(l.name));
}

/**
 * How one not-counted line reads in the footnote. A gap that comes from the database already names its reason in
 * brackets ("pasta (no amount given)", "chili sauce (no USDA food linked)"); adding "(no nutrition data)" after
 * it printed the reason twice.
 */
export function uncountedText(u: UncountedLine): string {
  const name = u.name.trim().replace(/[.\s]+$/, "");
  if (u.reason === "no data") return /\([^()]*\)$/.test(name) ? name : `${name} (no nutrition data)`;
  // "optional" / "to taste" after a name that already ends "(no amount given)" read as "(no ...) (optional)"; drop the first.
  return `${name.replace(/\s*\(no [^()]*\)$/i, "")} (${u.reason})`;
}

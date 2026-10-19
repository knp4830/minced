/*
 * Nutrient vocabulary and the maths that is the same everywhere nutrients are shown (recipe page, Me).
 *
 * The list of nutrients, their units and their Daily Values live in the `nutrients` table (migration by
 * the schema lane), NOT here. This file only knows how to read those rows, and a deliberately small
 * fallback for the six macro columns that `recipes` has always carried, used only when the table is
 * unreachable so the pages degrade instead of breaking.
 *
 * Nutrients are recognised by their USDA FoodData Central nutrient number (`fdc_number`: 208 energy,
 * 203 protein ...), which is stable, never by our own `key` text, so the layout cannot drift when a key
 * is renamed.
 *
 * Pure: no I/O. Importable from client and server.
 */

export type Nutrient = {
  id: number;
  key: string;
  name: string;
  unit: string;
  /** USDA FoodData Central nutrient number (e.g. 301 calcium). */
  fdcNumber: number | null;
  /** FDA Daily Value, in `dvUnit`. Null when the FDA sets none (total sugars). */
  dvAmount: number | null;
  dvUnit: string | null;
  displayGroup: string | null;
  sort: number;
};

/** USDA nutrient numbers the label layout and the macro summary depend on. */
export const FDC = {
  energy: 208,
  protein: 203,
  fat: 204,
  carbs: 205,
  fiber: 291,
  sugars: 269,
  addedSugars: 539,
  sodium: 307,
  cholesterol: 601,
  satFat: 606,
  transFat: 605,
  monoFat: 645,
  polyFat: 646,
} as const;

/** The top block of a Nutrition Facts label, in label order. Everything else is "vitamins and minerals". */
export const LABEL_TOP: readonly { fdc: number; indent: 0 | 1 | 2; bold: boolean }[] = [
  { fdc: FDC.fat, indent: 0, bold: true },
  { fdc: FDC.satFat, indent: 1, bold: false },
  { fdc: FDC.transFat, indent: 1, bold: false },
  { fdc: FDC.polyFat, indent: 1, bold: false },
  { fdc: FDC.monoFat, indent: 1, bold: false },
  { fdc: FDC.cholesterol, indent: 0, bold: true },
  { fdc: FDC.sodium, indent: 0, bold: true },
  { fdc: FDC.carbs, indent: 0, bold: true },
  { fdc: FDC.fiber, indent: 1, bold: false },
  { fdc: FDC.sugars, indent: 1, bold: false },
  { fdc: FDC.addedSugars, indent: 2, bold: false },
  { fdc: FDC.protein, indent: 0, bold: true },
];

/** Nutrients whose daily number is a ceiling to stay under, not a target to reach. */
export const LIMIT_FDC: ReadonlySet<number> = new Set([FDC.fat, FDC.satFat, FDC.cholesterol, FDC.sodium, FDC.addedSugars]);

/**
 * A micronutrient is only shown when at least this share of the counted ingredient mass reports it
 * (owner-approved default, docs/research/wave10-micronutrients-plan.md section 7 question 4).
 */
export const MIN_COVERAGE = 0.9;

export function isAddedSugar(n: Nutrient): boolean {
  return n.fdcNumber === FDC.addedSugars || /added[_ ]sugar/i.test(n.key) || /added sugar/i.test(n.name);
}

/** The recipes-table macro columns, mapped to the nutrient they hold. */
export const MACRO_COLUMNS: readonly { fdc: number; column: "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g" | "sodium_mg" }[] = [
  { fdc: FDC.energy, column: "calories" },
  { fdc: FDC.protein, column: "protein_g" },
  { fdc: FDC.carbs, column: "carbs_g" },
  { fdc: FDC.fat, column: "fat_g" },
  { fdc: FDC.fiber, column: "fiber_g" },
  { fdc: FDC.sodium, column: "sodium_mg" },
];

/**
 * Used only when the `nutrients` table cannot be read. Ids are negative so they can never collide with a
 * real row. Daily Values: FDA 2016 labelling rule, 2,000 calorie reference diet, adults and children 4+.
 */
export const FALLBACK_NUTRIENTS: Nutrient[] = [
  { id: -1, key: "calories", name: "Calories", unit: "kcal", fdcNumber: FDC.energy, dvAmount: 2000, dvUnit: "kcal", displayGroup: "macro", sort: 10 },
  { id: -2, key: "fat_g", name: "Total fat", unit: "g", fdcNumber: FDC.fat, dvAmount: 78, dvUnit: "g", displayGroup: "macro", sort: 20 },
  { id: -3, key: "sodium_mg", name: "Sodium", unit: "mg", fdcNumber: FDC.sodium, dvAmount: 2300, dvUnit: "mg", displayGroup: "macro", sort: 40 },
  { id: -4, key: "carbs_g", name: "Total carbohydrate", unit: "g", fdcNumber: FDC.carbs, dvAmount: 275, dvUnit: "g", displayGroup: "macro", sort: 50 },
  { id: -5, key: "fiber_g", name: "Dietary fiber", unit: "g", fdcNumber: FDC.fiber, dvAmount: 28, dvUnit: "g", displayGroup: "macro", sort: 60 },
  { id: -6, key: "protein_g", name: "Protein", unit: "g", fdcNumber: FDC.protein, dvAmount: 50, dvUnit: "g", displayGroup: "macro", sort: 90 },
];

/** Row from the `nutrients` table, as PostgREST returns it. */
export type NutrientRow = {
  id: number;
  key: string;
  name: string;
  unit: string;
  fdc_number: number | string | null;
  dv_amount: number | string | null;
  dv_unit: string | null;
  display_group: string | null;
  sort: number | null;
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toNutrient(r: NutrientRow): Nutrient {
  return {
    id: Number(r.id),
    key: r.key,
    name: r.name,
    unit: r.unit,
    fdcNumber: numOrNull(r.fdc_number),
    dvAmount: numOrNull(r.dv_amount),
    dvUnit: r.dv_unit,
    displayGroup: r.display_group,
    sort: r.sort ?? 0,
  };
}

/** Finds the nutrient with a USDA number, or undefined. */
export function byFdc(list: readonly Nutrient[], fdc: number): Nutrient | undefined {
  return list.find((n) => n.fdcNumber === fdc);
}

/**
 * Whole-number %DV, or null when the nutrient has no Daily Value. Rounded here so the number shown is the
 * number any bar or colour decision used (LESSONS: round before checking bands).
 */
export function percentDv(amount: number, n: Nutrient): number | null {
  if (n.dvAmount === null || n.dvAmount <= 0) return null;
  return Math.round((amount / n.dvAmount) * 100);
}

/**
 * FDA label rounding (21 CFR 101.9(c)): calories under 5 are 0, up to 50 round to the nearest 5, above 50 to the
 * nearest 10. Sodium under 5 mg is 0, up to 140 mg rounds to the nearest 5, above 140 to the nearest 10. Other mg
 * values over 140 round to the nearest 10; everything else to two significant figures. Never invents precision
 * USDA data does not have.
 */
export function roundForLabel(amount: number, n: Pick<Nutrient, "unit" | "fdcNumber">): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (n.fdcNumber === FDC.energy || n.unit === "kcal") {
    if (amount < 5) return 0;
    return amount <= 50 ? Math.round(amount / 5) * 5 : Math.round(amount / 10) * 10;
  }
  if (n.fdcNumber === FDC.sodium) {
    if (amount < 5) return 0;
    return amount <= 140 ? Math.round(amount / 5) * 5 : Math.round(amount / 10) * 10;
  }
  if (n.unit === "mg" && amount >= 140) return Math.round(amount / 10) * 10;
  if (amount >= 10) return Math.round(amount);
  if (amount >= 1) return Math.round(amount * 10) / 10;
  return Math.round(amount * 100) / 100;
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "310 mg", "0.4 g", "<0.01 g" for a non-zero value that rounds away. */
export function formatAmount(amount: number, n: Pick<Nutrient, "unit" | "fdcNumber">): string {
  const r = roundForLabel(amount, n);
  // FDA rounding makes a trace of energy or sodium "0" on a label; every other nutrient never shows as zero
  const fdaZero = n.fdcNumber === FDC.energy || n.unit === "kcal" || n.fdcNumber === FDC.sodium;
  if (amount > 0 && r === 0) return fdaZero ? (n.unit === "kcal" ? "0" : `0 ${n.unit}`) : `<0.01 ${n.unit}`;
  return n.unit === "kcal" ? nf.format(r) : `${nf.format(r)} ${n.unit}`;
}

/**
 * Rank of a nutrient inside "vitamins and minerals": the table's `sort`, then name. Top-block nutrients
 * are laid out by LABEL_TOP and never reach this.
 */
export function bySort(a: Nutrient, b: Nutrient): number {
  return a.sort - b.sort || a.name.localeCompare(b.name);
}

/** True when a nutrient belongs in the label's top block. */
export function inLabelTop(n: Nutrient): boolean {
  return n.fdcNumber !== null && LABEL_TOP.some((t) => t.fdc === n.fdcNumber);
}

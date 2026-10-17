/*
 * FDA Daily Values (DV), the reference amounts behind "% Daily Value" on a US Nutrition Facts label.
 *
 * Source: U.S. Food and Drug Administration, "Daily Value on the Nutrition and Supplement Facts Labels"
 * (https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels),
 * which restates 21 CFR 101.9(c)(9) and 21 CFR 101.36(b)(2)(iii) as amended by the 2016 labelling rule.
 * Values are for adults and children aged 4 and over, on a 2,000-calorie reference diet. They are
 * reference amounts for reading a label, NOT a personal recommendation; the dashboard's own calorie and
 * macro targets come from the person's body and goal (src/lib/me/targets.ts).
 *
 * `kind`:
 *   limit  - eat less than this (the bar turns paprika when you pass it)
 *   target - aim to reach this
 * `tracked` names the log field that carries the amount. Only nutrients Minced stores per recipe can be
 * shown today (see `tracked`); the rest of the table is here so that adding data later lights rows up with
 * no other change.
 */

export type NutrientKey = "fat" | "carbs" | "fiber" | "protein" | "sodium";

export type DvRow = {
  id: string;
  name: string;
  unit: "g" | "mg" | "µg";
  dv: number;
  kind: "limit" | "target";
  tracked?: NutrientKey;
};

export const FDA_DV: DvRow[] = [
  { id: "fat", name: "Total fat", unit: "g", dv: 78, kind: "limit", tracked: "fat" },
  { id: "sat_fat", name: "Saturated fat", unit: "g", dv: 20, kind: "limit" },
  { id: "cholesterol", name: "Cholesterol", unit: "mg", dv: 300, kind: "limit" },
  { id: "sodium", name: "Sodium", unit: "mg", dv: 2300, kind: "limit", tracked: "sodium" },
  { id: "carbs", name: "Total carbohydrate", unit: "g", dv: 275, kind: "target", tracked: "carbs" },
  { id: "fiber", name: "Fibre", unit: "g", dv: 28, kind: "target", tracked: "fiber" },
  { id: "added_sugar", name: "Added sugars", unit: "g", dv: 50, kind: "limit" },
  { id: "protein", name: "Protein", unit: "g", dv: 50, kind: "target", tracked: "protein" },
  { id: "vit_d", name: "Vitamin D", unit: "µg", dv: 20, kind: "target" },
  { id: "calcium", name: "Calcium", unit: "mg", dv: 1300, kind: "target" },
  { id: "iron", name: "Iron", unit: "mg", dv: 18, kind: "target" },
  { id: "potassium", name: "Potassium", unit: "mg", dv: 4700, kind: "target" },
  { id: "vit_a", name: "Vitamin A", unit: "µg", dv: 900, kind: "target" },
  { id: "vit_c", name: "Vitamin C", unit: "mg", dv: 90, kind: "target" },
  { id: "vit_e", name: "Vitamin E", unit: "mg", dv: 15, kind: "target" },
  { id: "vit_k", name: "Vitamin K", unit: "µg", dv: 120, kind: "target" },
  { id: "thiamin", name: "Thiamin", unit: "mg", dv: 1.2, kind: "target" },
  { id: "riboflavin", name: "Riboflavin", unit: "mg", dv: 1.3, kind: "target" },
  { id: "niacin", name: "Niacin", unit: "mg", dv: 16, kind: "target" },
  { id: "vit_b6", name: "Vitamin B6", unit: "mg", dv: 1.7, kind: "target" },
  { id: "folate", name: "Folate", unit: "µg", dv: 400, kind: "target" },
  { id: "vit_b12", name: "Vitamin B12", unit: "µg", dv: 2.4, kind: "target" },
  { id: "magnesium", name: "Magnesium", unit: "mg", dv: 420, kind: "target" },
  { id: "zinc", name: "Zinc", unit: "mg", dv: 11, kind: "target" },
  { id: "phosphorus", name: "Phosphorus", unit: "mg", dv: 1250, kind: "target" },
  { id: "selenium", name: "Selenium", unit: "µg", dv: 55, kind: "target" },
];

export type NutrientTotals = Partial<Record<NutrientKey, number>>;

export type NutrientLine = {
  id: string;
  name: string;
  unit: string;
  amount: number;
  dv: number;
  pct: number;
  over: boolean;
};

/** The rows we have data for, in table order. A `limit` nutrient is flagged once it passes 100%. */
export function nutrientLines(totals: NutrientTotals): NutrientLine[] {
  const out: NutrientLine[] = [];
  for (const row of FDA_DV) {
    if (!row.tracked) continue;
    const amount = totals[row.tracked];
    if (amount === undefined) continue;
    const pct = Math.round((amount / row.dv) * 100);
    out.push({ id: row.id, name: row.name, unit: row.unit, amount, dv: row.dv, pct, over: row.kind === "limit" && amount > row.dv });
  }
  return out;
}

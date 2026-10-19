/*
 * What the food type-ahead shows, and how a database row becomes one. Pure (no I/O) so the client
 * components can import the type and the tests can run it without a database.
 */

export type FoodHit = {
  kind: "ingredient" | "food";
  /** Canonical ingredient this hit is, or is a brand of. */
  ingredientId: number | null;
  /** The specific USDA food; null for a plain ingredient (its default food is used). */
  fdcId: number | null;
  /** What to show: the canonical name, or the product description. */
  label: string;
  /** Canonical ingredient name (what a recipe line stores). */
  canonicalName: string | null;
  brand: string | null;
  /** "1 tbsp (16 g)" style label serving, when the food has one. */
  serving: string | null;
  kcalPer100g: number | null;
  /** True/false when the data says; null when unknown. */
  hasNutrition: boolean | null;
};

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Cleans a USDA description for display: "SOY SAUCE, KIKKOMAN" becomes "Soy sauce, Kikkoman". */
export function tidyLabel(s: string): string {
  if (s !== s.toUpperCase() || s.length < 4) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function toFoodHit(r: Raw): FoodHit | null {
  const fdcId = numOrNull(r.fdc_id);
  const ingredientId = numOrNull(r.ingredient_id);
  const canonicalName = str(r.canonical_name) ?? str(r.ingredient_name);
  const label = str(r.label) ?? str(r.name) ?? str(r.description) ?? canonicalName;
  if (!label) return null;
  const kind = r.kind === "ingredient" || r.kind === "food" ? r.kind : fdcId !== null ? "food" : "ingredient";
  const hn = r.has_nutrition ?? r.has_data;
  const kcal = numOrNull(r.kcal_per_100g ?? r.energy_kcal ?? r.calories_per_100g);
  return {
    kind,
    ingredientId,
    fdcId,
    label: kind === "food" ? tidyLabel(label) : label,
    canonicalName,
    // never fall back to brand_owner: it is the barcode-prefix owner and is often unrelated to the product
    brand: str(r.brand_name) ?? str(r.brand),
    serving: str(r.household_serving) ?? str(r.serving) ?? str(r.serving_label),
    kcalPer100g: kcal,
    hasNutrition: typeof hn === "boolean" ? hn : kcal !== null ? true : null,
  };
}


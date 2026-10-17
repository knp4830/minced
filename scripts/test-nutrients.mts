// Run: node --experimental-strip-types scripts/test-nutrients.mts
// Plain asserts, no test runner. Covers the pure parts of the nutrition UI: the label rules
// (src/lib/recipeLabel.ts), amount formatting, food-hit parsing, the Add food input checks.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./me-alias-hook.mjs", import.meta.url);

const { buildLabel, uncountedLines, sodiumIsMinimum } = await import("../src/lib/recipeLabel.ts");
const { formatAmount, percentDv, roundForLabel, toNutrient, MIN_COVERAGE, FALLBACK_NUTRIENTS } = await import("../src/lib/nutrients.ts");
const { toFoodHit, tidyLabel } = await import("../src/lib/foodHit.ts");
const { checkFoodInput } = await import("../src/lib/foodInput.ts");
const { foodTitle } = await import("../src/lib/foodTitle.ts");

const N = (id: number, key: string, name: string, unit: string, fdc: number | null, dv: number | null, sort: number) =>
  toNutrient({ id, key, name, unit, fdc_number: fdc, dv_amount: dv, dv_unit: unit, display_group: null, sort });
const nutrients = [
  N(1, "calories", "Calories", "kcal", 208, 2000, 1),
  N(2, "fat_g", "Total fat", "g", 204, 78, 2),
  N(3, "sat_fat_g", "Saturated fat", "g", 606, 20, 3),
  N(4, "sodium_mg", "Sodium", "mg", 307, 2300, 4),
  N(5, "carbs_g", "Total carbohydrate", "g", 205, 275, 5),
  N(6, "protein_g", "Protein", "g", 203, 50, 6),
  N(7, "calcium_mg", "Calcium", "mg", 301, 1300, 7),
  N(8, "vitamin_c_mg", "Vitamin C", "mg", 401, 90, 8),
  N(9, "added_sugars_g", "Added sugars", "g", 539, 50, 9),
];
const byKey = Object.fromEntries(nutrients.map((n) => [n.key, n]));
const cols = { calories: 410, proteinG: 22, carbsG: 40, fatG: 18, fiberG: null, sodiumMg: 700 };
const row = (key: string, amount: number | null, coverage = 1) => ({ nutrient: byKey[key], amount, coverage });

// ---- rounding and formatting ----
assert.equal(roundForLabel(412, { unit: "kcal", fdcNumber: 208 }), 410);
assert.equal(roundForLabel(703, { unit: "mg", fdcNumber: 307 }), 700); // mg >= 140 to the nearest 10
assert.equal(roundForLabel(12.4, { unit: "g", fdcNumber: 204 }), 12);
assert.equal(roundForLabel(2.46, { unit: "g", fdcNumber: 204 }), 2.5);
assert.equal(roundForLabel(0.456, { unit: "g", fdcNumber: 204 }), 0.46);
assert.equal(formatAmount(0.001, { unit: "g", fdcNumber: 204 }), "<0.01 g"); // never shown as zero
assert.equal(formatAmount(0, { unit: "g", fdcNumber: 204 }), "0 g"); // a true zero stays zero
assert.equal(percentDv(1150, byKey.sodium_mg), 50);
assert.equal(percentDv(5, toNutrient({ id: 99, key: "sugars_g", name: "Total sugars", unit: "g", fdc_number: 269, dv_amount: null, dv_unit: null, display_group: null, sort: 1 })), null); // no DV, no %

// ---- label: nothing computed yet behaves like the old page (published columns only) ----
const plain = buildLabel(cols, null, []);
assert.equal(plain.basis, "published");
assert.equal(plain.calories?.text, "410");
assert.deepEqual(plain.top.map((r) => r.name), ["Total fat", "Sodium", "Total carbohydrate", "Protein"]);
assert.equal(plain.top.every((r) => !r.atLeast), true);
assert.equal(plain.micro.length, 0);
assert.equal(plain.top[0].pct, 23); // 18 / 78
assert.ok(FALLBACK_NUTRIENTS.length > 0);

// ---- label: computed micros appear, published macros win, partial marks only computed values ----
const complete = { status: "complete" as const, source: "usda_myplate" as const, gaps: [], rows: [row("calcium_mg", 260), row("vitamin_c_mg", 9, 0.95), row("sat_fat_g", 5), row("protein_g", 99)] };
const m1 = buildLabel(cols, complete, nutrients);
assert.equal(m1.basis, "published+computed");
assert.equal(m1.top.find((r) => r.fdc === 203)!.amount, 22); // the published protein, not the computed 99
assert.equal(m1.top.find((r) => r.fdc === 606)!.amountText, "5 g"); // saturated fat comes from the computed rows
assert.deepEqual(m1.micro.map((r) => r.name), ["Calcium", "Vitamin C"]);
assert.equal(m1.micro[0].pct, 20);
assert.equal(m1.top.some((r) => r.atLeast), false);

const partial = { status: "partial" as const, source: "computed" as const, gaps: ["gochujang"], rows: [row("calories", 400), row("fat_g", 17), row("calcium_mg", 100, 0.5), row("added_sugars_g", 4, 1)] };
const m2 = buildLabel({ calories: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, sodiumMg: null }, partial, nutrients);
assert.equal(m2.basis, "computed");
assert.equal(m2.calories?.atLeast, true); // computed on a partial recipe: "at least"
assert.equal(m2.top.find((r) => r.fdc === 204)!.atLeast, true);
assert.equal(m2.micro.length, 1);
assert.equal(m2.micro[0].noData, true); // coverage 0.5 < 0.9: "not enough data", never a low number
assert.equal(m2.micro[0].amountText, "");
assert.equal(MIN_COVERAGE, 0.9);
const added = m2.top.find((r) => r.estimated)!;
assert.equal(added.name, "Added sugars (estimated)");

// a nutrient nobody reports has no row at all (missing is not zero)
assert.equal(buildLabel(cols, { status: "complete", source: "computed", gaps: [], rows: [row("calcium_mg", null, 0)] }, nutrients).micro.length, 0);

// unavailable: computed rows are ignored, the published columns still show
const unavail = buildLabel(cols, { status: "unavailable", source: "usda_myplate", gaps: [], rows: [row("calcium_mg", 260)] }, nutrients);
assert.equal(unavail.micro.length, 0);
assert.equal(unavail.calories?.text, "410");

// ---- not-counted list and the sodium footnote ----
const lines = [
  { name: "salt", quantity: null, optional: false },
  { name: "parsley", quantity: 2, optional: true },
  { name: "gochujang", quantity: 1, optional: false },
  { name: "flour", quantity: 2, optional: false },
];
assert.deepEqual(uncountedLines(lines, ["gochujang"]), [
  { name: "gochujang", reason: "no data" },
  { name: "salt", reason: "to taste" },
  { name: "parsley", reason: "optional" },
]);
assert.equal(sodiumIsMinimum(lines), true);
assert.equal(sodiumIsMinimum([{ name: "salt", quantity: 1, optional: false }]), false);
assert.equal(sodiumIsMinimum([{ name: "salt", quantity: null, optional: true }]), false);

// ---- food hits: tolerant of column naming, brands stay linked to a canonical ingredient ----
const ing = toFoodHit({ kind: "ingredient", ingredient_id: 7, canonical_name: "soy sauce", has_nutrition: true })!;
assert.equal(ing.kind, "ingredient");
assert.equal(ing.fdcId, null);
assert.equal(ing.label, "soy sauce");
const brand = toFoodHit({ fdc_id: "123", ingredient_id: 7, canonical_name: "soy sauce", description: "SOY SAUCE", brand_owner: "Kikkoman Sales USA", household_serving: "1 tbsp (16 g)", kcal_per_100g: "60" })!;
assert.equal(brand.kind, "food");
assert.equal(brand.fdcId, 123);
assert.equal(brand.ingredientId, 7);
assert.equal(brand.label, "Soy sauce"); // shouted USDA descriptions are tidied
assert.equal(brand.hasNutrition, true);
assert.equal(foodTitle(brand), "Kikkoman Sales USA Soy sauce");
assert.equal(foodTitle({ label: "Kikkoman soy sauce", brand: "Kikkoman" }), "Kikkoman soy sauce"); // brand not repeated
assert.equal(toFoodHit({ kind: "food", fdc_id: 5, label: "x", has_nutrition: false })!.hasNutrition, false);
assert.equal(toFoodHit({ ingredient_id: 1 }), null);
assert.equal(tidyLabel("Already Fine"), "Already Fine");

// ---- Add food input checks ----
const ok = checkFoodInput({ ingredientId: 7, fdcId: null, quantity: "2,5", unit: "TBSP" });
assert.deepEqual(ok, { ok: true, ingredientId: 7, fdcId: null, quantity: 2.5, unit: "tbsp" });
assert.equal(checkFoodInput({ ingredientId: 0, fdcId: null, quantity: 1, unit: "g" }).ok, false);
assert.equal(checkFoodInput({ ingredientId: 7, fdcId: "abc", quantity: 1, unit: "g" }).ok, false);
assert.equal(checkFoodInput({ ingredientId: 7, fdcId: null, quantity: -1, unit: "g" }).ok, false);
assert.equal(checkFoodInput({ ingredientId: 7, fdcId: null, quantity: 1e9, unit: "g" }).ok, false);
assert.equal(checkFoodInput({ ingredientId: 7, fdcId: null, quantity: 1, unit: "barrel" }).ok, false); // only listed units
assert.equal(checkFoodInput({ ingredientId: 7, fdcId: null, quantity: 1, unit: "" }).ok, true); // "each"

console.log("test-nutrients: all assertions passed");

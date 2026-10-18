// Run: node --experimental-strip-types scripts/test-nutrients.mts
// Plain asserts, no test runner. Covers the pure parts of the nutrition UI: the label rules
// (src/lib/recipeLabel.ts), amount formatting, food-hit parsing, the Add food input checks.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./me-alias-hook.mjs", import.meta.url);

const { buildLabel, uncountedLines, uncountedText, sodiumIsMinimum } = await import("../src/lib/recipeLabel.ts");
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
  N(10, "mono_fat_g", "Monounsaturated fat", "g", 645, null, 10),
  N(11, "poly_fat_g", "Polyunsaturated fat", "g", 646, null, 11),
  N(12, "sugars_g", "Total sugars", "g", 269, null, 12),
  N(13, "potassium_mg", "Potassium", "mg", 306, 4700, 13),
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
// FDA label rounding (21 CFR 101.9(c))
assert.equal(roundForLabel(3, { unit: "kcal", fdcNumber: 208 }), 0); // under 5 kcal is 0
assert.equal(roundForLabel(47, { unit: "kcal", fdcNumber: 208 }), 45); // up to 50: nearest 5
assert.equal(roundForLabel(52, { unit: "kcal", fdcNumber: 208 }), 50); // above 50: nearest 10
assert.equal(roundForLabel(4, { unit: "mg", fdcNumber: 307 }), 0);
assert.equal(roundForLabel(87, { unit: "mg", fdcNumber: 307 }), 85); // sodium up to 140 mg: nearest 5
assert.equal(roundForLabel(143, { unit: "mg", fdcNumber: 307 }), 140);
assert.equal(formatAmount(3, { unit: "kcal", fdcNumber: 208 }), "0"); // a trace of energy is 0 on a label
assert.equal(formatAmount(3, { unit: "mg", fdcNumber: 307 }), "0 mg");
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

// published-vs-computed calorie disagreement flag (MyPlate only, more than 20 percent either way)
const withDelta = (kcalDelta: number | null, source: "usda_myplate" | "computed" = "usda_myplate") => ({ status: "complete" as const, source, gaps: [], kcalDelta, rows: [row("calcium_mg", 260)] });
assert.equal(buildLabel(cols, withDelta(0.35), nutrients).disagreement, 0.35);
assert.equal(buildLabel(cols, withDelta(-0.25), nutrients).disagreement, -0.25);
assert.equal(buildLabel(cols, withDelta(0.2), nutrients).disagreement, null); // exactly 20 percent is not above it
assert.equal(buildLabel(cols, withDelta(0.1), nutrients).disagreement, null);
assert.equal(buildLabel(cols, withDelta(0.5, "computed"), nutrients).disagreement, null);
assert.equal(buildLabel(cols, complete, nutrients).disagreement, null); // no delta on the data: no flag

// ---- the label must not contradict itself (published total next to computed parts) ----
const thousand = { status: "partial" as const, source: "usda_myplate" as const, gaps: [], kcalDelta: 0.75, rows: [row("fat_g", 14), row("sat_fat_g", 1.6), row("mono_fat_g", 2.3), row("poly_fat_g", 6.2), row("sugars_g", 30)] };
const ti = buildLabel({ calories: 59, proteinG: 0.3, carbsG: 4, fatG: 3.5, fiberG: null, sodiumMg: 200 }, thousand, nutrients);
assert.equal(ti.top.some((r) => r.fdc === 606 || r.fdc === 645 || r.fdc === 646), false); // 10 g of parts under a published 3.5 g total
assert.equal(ti.top.some((r) => r.fdc === 269), false); // sugars 30 g cannot sit under 4 g of carbohydrate
assert.equal(ti.breakdownHidden, true);
assert.equal(ti.top.find((r) => r.fdc === 204)!.amount, 3.5); // the published total is kept
const fits = buildLabel(cols, { status: "complete", source: "usda_myplate", gaps: [], rows: [row("fat_g", 17), row("sat_fat_g", 5), row("mono_fat_g", 6), row("poly_fat_g", 4)] }, nutrients);
assert.equal(fits.breakdownHidden, false);
assert.deepEqual(fits.top.filter((r) => r.indent === 1 && r.fdc !== 291).map((r) => r.name), ["Saturated fat", "Polyunsaturated fat", "Monounsaturated fat"]); // all in the top block, none under "vitamins and minerals"
assert.equal(fits.micro.some((r) => r.fdc === 645 || r.fdc === 646), false);

// columns written by refresh for a recipe we computed are computed, not "published"
const own = buildLabel({ calories: 689, proteinG: 30, carbsG: 20, fatG: 52, fiberG: 4, sodiumMg: 300 }, { status: "complete", source: "computed", gaps: [], rows: [row("calcium_mg", 100)] }, nutrients);
assert.equal(own.basis, "computed");
const ownPartial = buildLabel({ calories: 120, proteinG: 5, carbsG: 20, fatG: 2, fiberG: 1, sodiumMg: 100 }, { status: "partial", source: "computed", gaps: ["tvp"], rows: [row("potassium_mg", 70), row("calcium_mg", 0), row("vitamin_c_mg", 4)] }, nutrients);
assert.equal(ownPartial.calories?.atLeast, true);
assert.equal(ownPartial.micro.find((r) => r.fdc === 306)!.atLeast, true); // micros on a partial recipe are "at least" too
assert.equal(ownPartial.micro.find((r) => r.fdc === 301)!.noData, true); // "at least 0" says nothing
// a complete recipe's micros are exact
assert.equal(buildLabel(cols, complete, nutrients).micro.every((r) => !r.atLeast), true);

// not-counted wording: the reason is never printed twice
assert.equal(uncountedText({ name: "chili sauce (no USDA food linked)", reason: "no data" }), "chili sauce (no USDA food linked)");
assert.equal(uncountedText({ name: "chili sauce (no USDA food linked) ", reason: "no data" }), "chili sauce (no USDA food linked)");
assert.equal(uncountedText({ name: "gochujang", reason: "no data" }), "gochujang (no nutrition data)");
assert.equal(uncountedText({ name: "salt", reason: "to taste" }), "salt (to taste)");

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
// a main ingredient with no amount is a gap ("pasta (no amount given)"), not "to taste"
assert.deepEqual(uncountedLines([{ name: "pasta", quantity: null, optional: false }], ["pasta (no amount given)"]), [{ name: "pasta (no amount given)", reason: "no data" }]);
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

// ---- wave 10c: footnote credit, fat parts never under vitamins, no doubled "(no ...)" ----
assert.equal(plain.publishedBy, "other"); // no data: MyPlate is not credited
assert.equal(m1.publishedBy, "usda_myplate");
assert.equal(m2.publishedBy, "other"); // computed recipe
const fats = { status: "complete" as const, source: "computed" as const, gaps: [], rows: [row("fat_g", 20), row("sat_fat_g", 5), row("mono_fat_g", 8), row("poly_fat_g", 4), row("calcium_mg", 100)] };
const noCols = { calories: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, sodiumMg: null };
const mf = buildLabel(noCols, fats, nutrients);
assert.deepEqual(mf.top.map((r) => r.name), ["Total fat", "Saturated fat", "Polyunsaturated fat", "Monounsaturated fat"]);
assert.deepEqual(mf.micro.map((r) => r.name), ["Calcium"]); // mono/poly never listed under vitamins and minerals
const fatsHidden = buildLabel({ ...noCols, fatG: 3 }, { ...fats, source: "usda_myplate" as const }, nutrients);
assert.deepEqual(fatsHidden.micro.map((r) => r.name), ["Calcium"]); // even when the breakdown is hidden
assert.equal(uncountedText({ name: "pasta (no amount given)", reason: "no data" }), "pasta (no amount given)");
assert.equal(uncountedText({ name: "pasta", reason: "no data" }), "pasta (no nutrition data)");
assert.equal(uncountedText({ name: "pasta (no amount given)", reason: "optional" }), "pasta (optional)");
assert.equal(uncountedText({ name: "salt", reason: "to taste" }), "salt (to taste)");

console.log("test-nutrients: all assertions passed");

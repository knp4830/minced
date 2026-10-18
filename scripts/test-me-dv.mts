// Wave 10c: personal daily values, DRIs, baseline, snapshot rule. Loaded by test-me.mts.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./me-alias-hook.mjs", import.meta.url);

// ---- wave 10c: personal daily values (DRIs by sex and age), baseline, snapshot rule ----
const { readFileSync } = await import("node:fs");
const { personalDailyValues, baselineMacros, schofieldBmr, driFor } = await import("../src/lib/me/dailyValues.ts");
const { dayNutrientLines } = await import("../src/lib/me/nutrientTotals.ts");
const { snapshotFromRows } = await import("../src/lib/me/snapshot.ts");
const { toNutrient } = await import("../src/lib/nutrients.ts");

const driJson = JSON.parse(readFileSync(new URL("./nutrition/dri/dri.json", import.meta.url), "utf8")) as {
  nutrient_key: string;
  sex: "female" | "male";
  age_min: number;
  age_max: number;
  amount: number;
  kind: "rda" | "ai" | "cdrr";
}[];
const dris = driJson.map((r) => ({ key: r.nutrient_key, sex: r.sex, ageMin: r.age_min, ageMax: r.age_max, amount: r.amount, kind: r.kind }));
// complete: every key has both sexes, and the bands tile 9..120 with no gap or overlap
const driKeys = [...new Set(dris.map((d) => d.key))];
assert.equal(driKeys.length, 24);
for (const k of driKeys)
  for (const sex of ["female", "male"] as const)
    for (let age = 9; age <= 120; age++)
      assert.equal(dris.filter((d) => d.key === k && d.sex === sex && age >= d.ageMin && age <= d.ageMax).length, 1, `${k} ${sex} ${age}`);
// spot values against the National Academies tables
const at = (k: string, sex: "female" | "male", age: number) => driFor(dris, k, sex, age)!.amount;
assert.equal(at("iron_mg", "female", 25), 18);
assert.equal(at("iron_mg", "female", 60), 8);
assert.equal(at("iron_mg", "male", 25), 8);
assert.equal(at("calcium_mg", "female", 60), 1200);
assert.equal(at("calcium_mg", "male", 60), 1000);
assert.equal(at("potassium_mg", "male", 40), 3400);
assert.equal(at("potassium_mg", "female", 40), 2600);
assert.equal(at("vitamin_d_mcg", "female", 75), 20);
assert.equal(at("vitamin_k_mcg", "male", 30), 120);
assert.equal(at("vitamin_b6_mg", "female", 55), 1.5);
assert.equal(at("choline_mg", "female", 16), 400);
assert.equal(at("fiber_g", "male", 35), 38);
assert.equal(at("fiber_g", "female", 55), 21);
assert.equal(at("sodium_mg", "male", 13), 1800);
assert.equal(at("sodium_mg", "female", 30), 2300);
assert.equal(at("magnesium_mg", "female", 25), 310);
assert.equal(at("copper_mg", "male", 16), 0.89);
assert.equal(driFor(dris, "iron_mg", "male", 13)!.ageMin, 9); // 13 falls in the 9-13 band

const NN = (id: number, key: string, name: string, unit: string, fdc: number | null, dv: number | null, sort: number, group: string | null = null) =>
  toNutrient({ id, key, name, unit, fdc_number: fdc, dv_amount: dv, dv_unit: dv === null ? null : unit, display_group: group, sort });
const nl = [
  NN(1, "energy_kcal", "Calories", "kcal", 208, 2000, 1),
  NN(2, "fat_g", "Total fat", "g", 204, 78, 2),
  NN(3, "sat_fat_g", "Saturated fat", "g", 606, 20, 3),
  NN(4, "mono_fat_g", "Monounsaturated fat", "g", 645, null, 4),
  NN(5, "cholesterol_mg", "Cholesterol", "mg", 601, 300, 5),
  NN(6, "protein_g", "Protein", "g", 203, 50, 6),
  NN(7, "iron_mg", "Iron", "mg", 303, 18, 7),
  NN(8, "sugars_g", "Total sugars", "g", 269, null, 8),
  NN(9, "added_sugars_g", "Added sugars", "g", 539, 50, 9),
  NN(10, "vitamin_d_iu", "Vitamin D (IU)", "IU", 324, null, 10, "hidden"),
];
const macros = { kcal: 2260, proteinG: 160, carbsG: 235, fatG: 76, source: "targets" as const };
const dv = personalDailyValues(nl, dris, { sex: "male", age: 34, macros });
assert.equal(dv.get("protein_g")!.amount, 160);
assert.equal(dv.get("fat_g")!.amount, 76);
assert.equal(dv.get("sat_fat_g")!.amount, 25); // 10% of 2,260 kcal / 9 = 25.1
assert.equal(dv.get("added_sugars_g")!.amount, 57); // 226 kcal / 4 = 56.5
assert.equal(dv.get("iron_mg")!.amount, 8); // a man of 34, not the FDA 18
assert.equal(dv.get("iron_mg")!.basis, "rda");
assert.equal(dv.get("cholesterol_mg")!.basis, "fda"); // no DRI exists
assert.equal(dv.has("mono_fat_g"), false); // no % where nothing defines one
assert.equal(personalDailyValues(nl, dris, { sex: "female", age: 28, macros }).get("iron_mg")!.amount, 18);
// sex or age unknown: everything is the FDA value
const fdaDv = personalDailyValues(nl, dris, { sex: null, age: null, macros: null });
assert.equal(fdaDv.get("iron_mg")!.amount, 18);
assert.equal(fdaDv.get("fat_g")!.basis, "fda");

// baseline from weight, sex, age: Schofield x 1.2 (sedentary)
assert.equal(Math.round(schofieldBmr("male", 25, 80)), 1897); // 15.057 x 80 + 692.2
assert.equal(Math.round(schofieldBmr("female", 40, 65)), 1374); // 8.126 x 65 + 845.6
const base = baselineMacros("female", 40, 65);
assert.equal(base.kcal, 1650); // 1373.8 x 1.2 = 1648.6, to the nearest 10
assert.equal(base.proteinG, 124);
assert.equal(base.source, "baseline");
assert.equal(baselineMacros("female", 80, 40).kcal >= 1200, true); // never under the floor

// the diary rows: personal %, grouping, no hidden rows
const mkEntry = (nutrients: Record<string, number> | null) => ({
  id: "e", meal: "lunch", name: "x", servings: 1, calories: 500, proteinG: 40, carbsG: 50, fatG: 20,
  fiberG: null, sodiumMg: null, nutrients, source: "recipe", recipe: null,
});
const lines = dayNutrientLines([mkEntry({ iron_mg: 4, sat_fat_g: 5, mono_fat_g: 6 })] as never, nl, dv);
assert.equal(lines.find((l) => l.key === "iron_mg")!.pct, 50); // 4 of 8 mg
assert.equal(lines.find((l) => l.key === "iron_mg")!.group, "micro");
assert.equal(lines.find((l) => l.key === "mono_fat_g")!.group, "top");
assert.equal(lines.find((l) => l.key === "sat_fat_g")!.indent, 1);
assert.equal(lines.some((l) => l.key === "vitamin_d_iu"), false); // hidden rows never appear
assert.equal(lines.some((l) => l.key === "energy_kcal"), false);
assert.equal(lines.find((l) => l.key === "fat_g")!.pct, 26); // 20 of the 76 g fat target
const fdaLines = dayNutrientLines([mkEntry({ iron_mg: 4 })] as never, nl);
assert.equal(fdaLines.find((l) => l.key === "iron_mg")!.pct, 22); // 4 of the FDA 18

// the snapshot rule: what Me may add up is what the recipe label would show
const SR = (key: string, amount: number | null, coverage: number) => ({ nutrient: nl.find((n) => n.key === key)!, amount, coverage });
assert.deepEqual(
  snapshotFromRows([SR("iron_mg", 3, 0.95), SR("sat_fat_g", 4, 0.6), SR("protein_g", 30, 1), SR("added_sugars_g", 5, 0.3), SR("vitamin_d_iu", 100, 1), SR("cholesterol_mg", 0, 1)], false),
  { iron_mg: 3, added_sugars_g: 5, cholesterol_mg: 0 },
); // sat fat at 60% coverage withheld; macro column and hidden row skipped
assert.deepEqual(snapshotFromRows([SR("cholesterol_mg", 0, 1), SR("iron_mg", 2, 1)], true), { iron_mg: 2 }); // a partial recipe's zero is unknown
assert.equal(snapshotFromRows([SR("iron_mg", 2, 0.5)], false), null);
console.log("test-me-dv: all assertions passed");

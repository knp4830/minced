// Run: node --experimental-strip-types scripts/test-scaling.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
import assert from "node:assert/strict";
import { displayQuantity, pluralizeName, formatAmount, parseAmount, scaleQuantity } from "../src/lib/scaling.ts";

const show = (q: number | null, u: string | null, base: number, to: number) => {
  const r = displayQuantity({ quantity: q, unit: u }, base, to);
  return `${r.amount}${r.unit ? " " + r.unit : ""}`;
};

// Identity at the base servings.
assert.equal(show(1, "tsp", 3, 3), "1 tsp");
assert.equal(show(2, "tbsp", 4, 4), "2 tbsp");
assert.equal(show(5, null, 3, 3), "5");

// Doubling and halving.
assert.equal(show(1, "cup", 4, 8), "2 cups");
assert.equal(show(1, "cup", 4, 2), "1/2 cup");
assert.equal(show(1, "tsp", 2, 1), "1/2 tsp");

// Unit promotion: only when the number reads better.
assert.equal(show(1, "tsp", 3, 9), "1 tbsp");
assert.equal(show(2, "tbsp", 4, 8), "1/4 cup");
assert.equal(show(0.5, "tbsp", 2, 1), "3/4 tsp"); // 0.25 tbsp steps down
assert.equal(show(250, "g", 4, 16), "1 kg");
assert.equal(show(16, "oz", 4, 4), "1 lb");

// Fractions: thirds and eighths, no 0.333.
assert.equal(show(1, "cup", 3, 1), "1/3 cup");
assert.equal(show(1, "cup", 3, 2), "2/3 cup");
assert.equal(show(1.5, "cup", 4, 6), "2 1/4 cups");
assert.equal(show(5, null, 3, 4), "6 1/2"); // bare counts snap to halves
const egg = (q: number, base: number, to: number) => displayQuantity({ quantity: q, unit: null, name: "egg" }, base, to).amount;
assert.equal(egg(3, 4, 5), "4"); // 3.75 eggs -> 4, never "3 3/4"
assert.equal(pluralizeName("egg", "4"), "eggs");
assert.equal(pluralizeName("egg", "1"), "egg");
assert.equal(pluralizeName("apple", "2 1/2"), "apples");
assert.equal(pluralizeName("tomato", "2"), "tomatoes");
assert.equal(pluralizeName("cherry", "3"), "cherries");
assert.equal(pluralizeName("garlic cloves", "3"), "garlic cloves");
assert.equal(pluralizeName("onion (yellow)", "2"), "onions (yellow)");

// Count units pluralise; singular stays singular.
assert.equal(show(1, "can", 3, 6), "2 cans");
assert.equal(show(1, "clove", 2, 1), "1/2 clove");
assert.equal(show(2, "clove", 2, 2), "2 cloves");

// To-taste lines are never scaled.
assert.equal(show(null, null, 4, 8), "to taste");

// Tiny and huge amounts stay sensible.
assert.equal(formatAmount(0.01), "1/8");
assert.equal(formatAmount(12.4), "12");
assert.equal(formatAmount(2.96), "3");

// Raw maths is exact (no premature rounding).
assert.equal(scaleQuantity(1, 3, 9), 3);
assert.ok(Math.abs(scaleQuantity(1, 3, 1) - 1 / 3) < 1e-12);

// The printed amount must stay within 3% of the real one: 4 1/2 tbsp is NOT 1/4 cup.
assert.equal(show(1.5, "tbsp", 1, 3), "4 1/2 tbsp");
assert.equal(show(4, "tbsp", 1, 1), "1/4 cup");

// Review item 15.3: no decimals, no "0.2 tsp"; rounded values are flagged approximate.
assert.equal(show(0.1, "tsp", 1, 1), "a pinch");
assert.equal(show(1, "tsp", 12, 1), "a pinch"); // 1/12 tsp
assert.equal(show(1, "tsp", 8, 1), "1/8 tsp");
assert.equal(show(0.2, "tsp", 1, 1), "1/4 tsp"); // nearest eighth, flagged approximate
assert.equal(displayQuantity({ quantity: 0.2, unit: "tsp" }, 1, 1).approx, true);
assert.equal(show(41, "tsp", 1, 1), "3/4 cup + 5 tsp"); // 41 tsp is 0.854 cup; 7/8 is not a measuring cup
assert.ok(!/\./.test(show(1, "cup", 7, 3)), "never a decimal");
assert.ok(!/\./.test(show(3, null, 7, 1)), "never a decimal for bare counts");
assert.equal(displayQuantity({ quantity: 0.2, unit: null }, 1, 1).approx, true);
assert.equal(displayQuantity({ quantity: 2, unit: "cup" }, 1, 1).approx, undefined);

// Kitchen-friendly volume: the largest sensible unit, common fractions, compound when inexact.
assert.equal(show(38, "tsp", 1, 1), "3/4 cup + 2 tsp");
assert.equal(show(12.5, "tbsp", 1, 1), "3/4 cup + 1/2 tbsp");
assert.equal(show(10, "tbsp", 1, 1), "1/2 cup + 2 tbsp");
assert.equal(show(8, "tbsp", 1, 1), "1/2 cup");
assert.equal(show(20, "tsp", 1, 1), "1/3 cup + 4 tsp");
assert.equal(show(10, "tsp", 1, 1), "3 tbsp + 1 tsp");
assert.equal(show(7, "tsp", 1, 1), "2 tbsp + 1 tsp");
assert.equal(show(4, "tsp", 1, 1), "1 tbsp + 1 tsp");
assert.equal(show(2, "tsp", 1, 1), "2 tsp");
assert.equal(show(1.75, "cup", 1, 1), "1 3/4 cups");
assert.equal(show(1.9, "cup", 1, 1), "1 3/4 cups + 7 tsp"); // 1.9 cup is not a measure: cup plus remainder
assert.ok(!/[.]/.test(show(1.9, "cup", 1, 1)));
// Nothing ever drifts more than 3% unless it says "about".
for (const base of [3, 12]) {
  for (const to of [1, 2, 3, 4, 5, 6, 7, 12, 24]) {
    for (const [q, u] of [[10, "tbsp"], [0.75, "cup"], [1.75, "cup"], [2, "tsp"], [8, "tbsp"], [0.5, "tsp"], [1, "tbsp"]] as [number, string][]) {
      const d = displayQuantity({ quantity: q, unit: u }, base, to);
      const tsp = { tsp: 1, tbsp: 3, cup: 48 } as Record<string, number>;
      const want = ((q * to) / base) * tsp[u];
      if (d.amount === "a pinch") continue;
      let got = 0;
      const [cupPart, ...rest] = `${d.amount} ${d.unit}`.split(" + ");
      for (const part of [cupPart, ...rest]) {
        const m = /^([\d/ ]+?)\s*(tsp|tbsp|cups?)$/.exec(part.trim());
        assert.ok(m, `parseable: ${base}->${to} ${q} ${u}: "${d.amount} ${d.unit}"`);
        got += parseAmount(m[1]) * tsp[m[2].replace(/s$/, "")];
      }
      if (!d.approx && want >= 0.2) assert.ok(Math.abs(got - want) / want <= 0.03 + 1e-9, `${base}->${to} ${q} ${u}: shown ${d.amount} ${d.unit} vs ${want} tsp`);
    }
  }
}

// Counted items: halves, "about" when inexact, eggs whole from 2 up.
const cnt = (q: number, u: string | null, base: number, to: number, name: string) => {
  const r = displayQuantity({ quantity: q, unit: u, name }, base, to);
  return `${r.approx ? "about " : ""}${r.amount}${r.unit ? " " + r.unit : ""}`;
};
assert.equal(cnt(2, null, 12, 1, "apple"), "about 1/4");
assert.equal(cnt(2, null, 12, 2, "apple"), "1/3");
assert.equal(cnt(2, null, 12, 5, "apple"), "about 3/4"); // 0.83 snaps to the nearest common fraction
assert.equal(cnt(2, null, 12, 7, "apple"), "about 1"); // 1.17
assert.equal(cnt(2, null, 12, 24, "apple"), "4");
assert.equal(cnt(3, null, 12, 4, "egg"), "1");
assert.equal(cnt(3, null, 12, 1, "egg"), "about 1/2");
assert.equal(cnt(3, null, 12, 7, "egg"), "about 2"); // 1.75
assert.equal(cnt(5, "clove", 3, 1, "garlic"), "about 1 1/2 cloves");
assert.equal(cnt(5, "clove", 3, 12, "garlic"), "20 cloves");
assert.equal(cnt(1, "head", 3, 12, "bok choy"), "4 heads");

// Real recipes at 1, 2, 4 and 12 servings (apple-cake serves 12, garlic-bok-choy serves 3).
type Line = [number, string | null, string];
const appleCake: Line[] = [[10, "tbsp", "butter"], [0.75, "cup", "sugar"], [3, null, "egg"], [1.75, "cup", "flour"], [2, "tsp", "baking powder"], [1, "tbsp", "lemon"], [2, null, "apple"], [8, "tbsp", "apricot jam"]];
const bokChoy: Line[] = [[1, "head", "bok choy"], [5, "clove", "garlic"], [2, "tsp", "oil"], [0.5, "tsp", "salt"]];
const row = (lines: Line[], base: number, to: number) => lines.map(([q, u, n]) => cnt(q, u, base, to, n)).join(" | ");
assert.equal(row(appleCake, 12, 1), "2 1/2 tsp | 1 tbsp | about 1/2 | 2 tbsp + 1 tsp | about 1/8 tsp | 1/4 tsp | about 1/4 | 2 tsp");
assert.equal(row(appleCake, 12, 2), "1 tbsp + 2 tsp | 2 tbsp | 1/2 | 1/4 cup + 2 tsp | 1/3 tsp | 1/2 tsp | 1/3 | 1 tbsp + 1 tsp");
assert.equal(row(appleCake, 12, 4), "3 tbsp + 1 tsp | 1/4 cup | 1 | 1/2 cup + 4 tsp | 2/3 tsp | 1 tsp | 2/3 | 2 tbsp + 2 tsp");
assert.equal(row(appleCake, 12, 12), "1/2 cup + 2 tbsp | 3/4 cup | 3 | 1 3/4 cups | 2 tsp | 1 tbsp | 2 | 1/2 cup");
assert.equal(row(bokChoy, 3, 1), "1/3 head | about 1 1/2 cloves | 2/3 tsp | about 1/8 tsp");
assert.equal(row(bokChoy, 3, 2), "2/3 head | about 3 1/2 cloves | 1 1/3 tsp | 1/3 tsp");
assert.equal(row(bokChoy, 3, 4), "about 1 1/2 heads | 6 1/2 cloves | 2 2/3 tsp | 2/3 tsp");
assert.equal(row(bokChoy, 3, 12), "4 heads | 20 cloves | 2 tbsp + 2 tsp | 2 tsp");

console.log("scaling: all assertions passed");

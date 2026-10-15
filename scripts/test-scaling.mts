// Run: node --experimental-strip-types scripts/test-scaling.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
import assert from "node:assert/strict";
import { displayQuantity, formatAmount, scaleNoteAmounts, scaleQuantity } from "../src/lib/scaling.ts";

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
assert.equal(show(5, null, 3, 4), "6 2/3");

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
assert.equal(show(41, "tsp", 1, 1), "7/8 cup"); // 41 tsp is 0.854 cup
assert.ok(!/\./.test(show(1, "cup", 7, 3)), "never a decimal");
assert.ok(!/\./.test(show(3, null, 7, 1)), "never a decimal for bare counts");
assert.equal(displayQuantity({ quantity: 0.2, unit: null }, 1, 1).approx, true);
assert.equal(displayQuantity({ quantity: 2, unit: "cup" }, 1, 1).approx, undefined);

// Alternatives and size counts inside prep notes follow the servings; package sizes do not.
assert.equal(scaleNoteAmounts("or 1/2 teaspoon garlic powder", 2, 4), "or 1 tsp garlic powder");
assert.equal(scaleNoteAmounts("or 1 cup thawed frozen chunks", 2, 4), "or 2 cups thawed frozen chunks");
assert.equal(scaleNoteAmounts("2 large", 2, 4), "4 large");
assert.equal(scaleNoteAmounts("15 ounce can, drained", 2, 4), "15 ounce can, drained");
assert.equal(scaleNoteAmounts("14.5 oz each, drained", 2, 4), "14.5 oz each, drained");
assert.equal(scaleNoteAmounts("cut into 1/2 inch pieces", 2, 4), "cut into 1/2 inch pieces");
assert.equal(scaleNoteAmounts("or 1 cup", 4, 4), "or 1 cup");

console.log("scaling: all assertions passed");

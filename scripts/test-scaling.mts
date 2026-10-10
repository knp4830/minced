// Run: node --experimental-strip-types scripts/test-scaling.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
import assert from "node:assert/strict";
import { displayQuantity, formatAmount, scaleQuantity } from "../src/lib/scaling.ts";

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

console.log("scaling: all assertions passed");

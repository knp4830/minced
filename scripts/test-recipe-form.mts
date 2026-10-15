// Run: node --experimental-strip-types scripts/test-recipe-form.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
import assert from "node:assert/strict";
import { formatQuantity, parseQuantity } from "../src/lib/recipeForm.ts";

const val = (s: string) => {
  const r = parseQuantity(s);
  return r.ok ? r.value : "REJECTED";
};

// Empty means "to taste".
assert.equal(val(""), null);
assert.equal(val("   "), null);
// Plain numbers, comma decimals.
assert.equal(val("2"), 2);
assert.equal(val("0.5"), 0.5);
assert.equal(val("1,5"), 1.5);
// Fractions and mixed numbers.
assert.equal(val("1/2"), 0.5);
assert.equal(val("1 1/2"), 1.5);
// Not amounts. Note: "1." is rejected while a cook is mid-typing (pinned behaviour).
for (const bad of ["abc", "1/0", "1.", "-1", "1/2/3"]) assert.equal(val(bad), "REJECTED", `reject ${bad}`);

// Round trip back into the edit form: the common kitchen fractions survive as text.
for (const s of ["1/2", "1/4", "3/4", "1/3", "2/3", "1/8", "1 1/2", "2"]) {
  assert.equal(val(formatQuantity(val(s) as number)), val(s), `round trip ${s}`);
}
assert.equal(formatQuantity(null), "");
// Eighths other than 1/8 come back as decimals (pinned behaviour).
assert.equal(formatQuantity(0.875), "0.875");

console.log("recipe form: all passed");

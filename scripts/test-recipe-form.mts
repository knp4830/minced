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

// ---------------------------------------------------------------------------
// Draft autosave helpers (M5.2)
// ---------------------------------------------------------------------------
import {
  AUTOSAVE,
  autosaveReadiness,
  autosaveText,
  backupKey,
  emptyValues,
  parseBackup,
  valuesSignature,
} from "../src/lib/recipeForm.ts";

// Nothing is sent until there is a title of 3+ letters and a sensible serving count.
const base = emptyValues();
assert.deepEqual(autosaveReadiness({ ...base, title: "" }), { ready: false, waitingFor: "title" });
assert.deepEqual(autosaveReadiness({ ...base, title: "  ab  " }), { ready: false, waitingFor: "title" });
assert.deepEqual(autosaveReadiness({ ...base, title: "Soup", servings: "" }), { ready: false, waitingFor: "servings" });
assert.deepEqual(autosaveReadiness({ ...base, title: "Soup", servings: "0" }), { ready: false, waitingFor: "servings" });
assert.deepEqual(autosaveReadiness({ ...base, title: "Soup", servings: "101" }), { ready: false, waitingFor: "servings" });
assert.deepEqual(autosaveReadiness({ ...base, title: "Soup", servings: "4" }), { ready: true });

// The signature changes for anything a save stores, and not for the rights tick (never stored by a draft).
const a = { ...base, title: "Soup" };
assert.equal(valuesSignature(a), valuesSignature({ ...a }));
assert.equal(valuesSignature(a), valuesSignature({ ...a, rights: true }));
assert.notEqual(valuesSignature(a), valuesSignature({ ...a, title: "Soups" }));
assert.notEqual(valuesSignature(a), valuesSignature({ ...a, steps: ["x", ""] }));
assert.notEqual(valuesSignature(a), valuesSignature({ ...a, diets: [1] }));
assert.notEqual(
  valuesSignature(a),
  valuesSignature({ ...a, ingredients: [{ ...a.ingredients[0], name: "onion" }, ...a.ingredients.slice(1)] }),
);
// A display-only field on an ingredient row (the brand label) is not an edit; the picked food is.
const withLabel = { ...a, ingredients: [{ ...a.ingredients[0], foodLabel: "Kikkoman" }, ...a.ingredients.slice(1)] };
assert.equal(valuesSignature(a), valuesSignature(withLabel));
assert.notEqual(valuesSignature(a), valuesSignature({ ...a, ingredients: [{ ...a.ingredients[0], fdcId: 5 }, ...a.ingredients.slice(1)] }));

// Status wording: calm, and never says "Saving…" as something to announce.
assert.equal(autosaveText({ kind: "idle" }), "");
assert.equal(autosaveText({ kind: "saved", skipped: 0 }), "Saved");
assert.match(autosaveText({ kind: "saved", skipped: 1 }), /^Saved\. 1 ingredient line is not saved yet/);
assert.match(autosaveText({ kind: "saved", skipped: 3 }), /3 ingredient lines are not saved yet/);
assert.match(autosaveText({ kind: "retrying" }), /nothing you typed is lost/);
assert.match(autosaveText({ kind: "waiting", waitingFor: "title" }), /title/);
assert.equal(autosaveText({ kind: "stopped", message: "Sign in again." }), "Sign in again.");

// Timing: the quiet period is shorter than the longest wait, and retries back off without ever shrinking.
assert.ok(AUTOSAVE.quietMs < AUTOSAVE.maxWaitMs);
for (let i = 1; i < AUTOSAVE.retryMs.length; i++) assert.ok(AUTOSAVE.retryMs[i] >= AUTOSAVE.retryMs[i - 1]);

// Device backup: round trips, and junk is treated as no backup (never throws).
const backup = JSON.stringify({ at: 123, values: { ...a, ingredients: [{ quantity: "1", unit: "cup", name: "rice" }], rights: true } });
const parsed = parseBackup(backup);
assert.ok(parsed);
assert.equal(parsed.values.title, "Soup");
assert.equal(parsed.values.rights, false);
assert.equal(parsed.values.ingredients[0].optional, false);
for (const junk of [null, "", "not json", "{}", '{"at":1}', '{"at":1,"values":{"title":1}}', JSON.stringify({ at: 1, values: { ...a, steps: [1] } })]) {
  assert.equal(parseBackup(junk), null, `junk backup: ${junk}`);
}
assert.notEqual(backupKey(null), backupKey("11111111-1111-1111-1111-111111111111"));

console.log("recipe form: all passed");

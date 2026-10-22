// Run: node --experimental-strip-types scripts/test-allergens.mts
// Plain asserts, no test runner. Covers the legacy `nuts` slug (URL and prefs cookie) and the recipe-page allergen
// model (required vs optional-only vs "varies"), which is built from the derived tables.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./me-alias-hook.mjs", import.meta.url);

const S = await import("../src/lib/allergenSlugs.ts");
const I = await import("../src/lib/allergenInfo.ts");
const F = await import("../src/lib/filters.ts");
const P = await import("../src/lib/prefs.ts");

// ---- legacy slug -------------------------------------------------------------------------------------------------
assert.deepEqual(S.expandLegacyAllergens(["nuts"]), ["peanuts", "tree-nuts"]);
assert.deepEqual(S.expandLegacyAllergens(["dairy", "nuts", "peanuts"]), ["dairy", "peanuts", "tree-nuts"]);
assert.deepEqual(S.expandLegacyAllergens(["shellfish"]), ["shellfish"], "shellfish in a URL means crustaceans only");
assert.deepEqual(S.expandLegacyAllergens([]), []);
// A prefs cookie written before the split (v1) said shellfish when it covered clams, oysters and scallops: still protects.
assert.deepEqual(S.expandPreSplitAllergens(["shellfish"]), ["shellfish", "mollusks"]);
assert.deepEqual(S.expandPreSplitAllergens(["nuts", "shellfish", "mollusks"]), ["peanuts", "tree-nuts", "shellfish", "mollusks"]);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
assert.deepEqual(P.decodePrefs(b64({ v: 1, d: [], x: ["shellfish"], u: "" })), { diet: [], exclude: ["mollusks", "shellfish"] }, "v1 cookie widened");
assert.deepEqual(P.decodePrefs(b64({ v: 2, d: [], x: ["shellfish"], u: "" })), { diet: [], exclude: ["shellfish"] }, "v2 cookie read as written");
assert.equal(P.decodePrefs(b64({ v: 3, d: [], x: [], u: "" })), null);
assert.deepEqual(P.decodePrefs(P.encodePrefs({ diet: [], exclude: ["shellfish"] }, "abcd1234")), { diet: [], exclude: ["shellfish"] }, "round trip");
assert.deepEqual(F.parseFilters({ exclude: "nuts,soy" }).exclude, ["peanuts", "tree-nuts", "soy"], "old link keeps protecting");
assert.deepEqual(F.parseFilters({ exclude: "peanuts" }).exclude, ["peanuts"]);
const vocab = { diets: ["vegan"], allergens: ["peanuts", "tree-nuts", "soy"] };
assert.deepEqual(P.restrictToVocab({ diet: [], exclude: ["nuts", "soy"] }, vocab), { diet: [], exclude: ["peanuts", "soy", "tree-nuts"] });

// ---- recipe page model ---------------------------------------------------------------------------------------------
const a = (slug: string, name: string, basis: "inherent" | "typical" | "varies" = "inherent") => ({ basis, allergens: { slug, name } });
const lines = [
  { name: "peanut butter", optional: false, allergenSlugs: ["peanuts"] },
  { name: "peanuts", optional: true, allergenSlugs: ["peanuts"] },
  { name: "walnuts", optional: true, allergenSlugs: ["tree-nuts"] },
  { name: "chocolate chips", optional: false, allergenSlugs: ["dairy", "soy"] },
  { name: "flour", optional: false, allergenSlugs: ["wheat", "gluten"] },
];
const info = I.buildAllergenInfo(
  [a("peanuts", "Peanuts"), a("dairy", "Dairy", "varies"), a("soy", "Soy", "typical"), a("gluten", "Gluten"), a("wheat", "Wheat")],
  [a("tree-nuts", "Tree nuts")],
  lines,
);
assert.deepEqual(info.map((x) => x.slug), ["dairy", "gluten", "peanuts", "soy", "wheat", "tree-nuts"], "required A-Z, then optional-only");
const peanuts = info.find((x) => x.slug === "peanuts")!;
assert.equal(peanuts.optionalOnly, false);
assert.deepEqual(peanuts.sources, ["peanut butter"], "required sources exclude the optional peanut line");
const walnut = info.find((x) => x.slug === "tree-nuts")!;
assert.equal(walnut.optionalOnly, true);
assert.deepEqual(walnut.sources, ["walnuts"]);
assert.equal(info.find((x) => x.slug === "dairy")!.basis, "varies");
// optional entry for an allergen that is also required is dropped, never shown twice
assert.equal(I.buildAllergenInfo([a("peanuts", "Peanuts")], [a("peanuts", "Peanuts")], lines).length, 1);
assert.deepEqual(I.buildAllergenInfo([], [], lines), []);
assert.equal(I.joinNames(["milk", "butter", "egg"]), "milk, butter and egg");
assert.equal(I.joinNames(["milk"]), "milk");
assert.equal(I.sentenceName("Tree nuts"), "tree nuts");

console.log("allergens tests: ok");

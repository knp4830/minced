// Run: node --experimental-strip-types scripts/test-filters-defaults.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
// Covers the saved-defaults path: the merge rules (withDefaults), the chip-toggle materialising, the prefs
// cookie codec and its hostile inputs, the chip label, and the Settings validators.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./me-alias-hook.mjs", import.meta.url);

const F = await import("../src/lib/filters.ts");
const P = await import("../src/lib/prefs.ts");
const V = await import("../src/lib/settingsValidate.ts");
const { parseFilters, serializeFilters, filtersToQuery, withDefaults, toggleFoodChip, withFilters, hasActiveFilters, isAllergenLocked, withoutNarrowing } = F;

const veg = { diet: ["vegetarian"], exclude: ["peanuts"] };

// ---- withDefaults: the truth table -------------------------------------------------------------------------
{
  // nothing saved: identical to today, whatever the URL says
  const url = parseFilters({ diet: "vegan", exclude: "soy" });
  const s = withDefaults(url, null);
  assert.deepEqual(s.effective, url);
  assert.equal(s.applied, null);
  assert.equal(s.saved, null);
  assert.equal(s.dietOff, false);
  assert.equal(s.allergensShown, false);
  // empty saved defaults count as none
  assert.equal(withDefaults({}, { diet: [], exclude: [] }).saved, null);
}
{
  // nothing in the URL: both dimensions come from the defaults
  const s = withDefaults(parseFilters({ q: "soup" }), veg);
  assert.deepEqual(s.effective.diet, ["vegetarian"]);
  assert.deepEqual(s.effective.exclude, ["peanuts"]);
  assert.equal(s.effective.q, "soup");
  assert.deepEqual(s.applied, veg);
  assert.equal(s.dietOff, false);
  assert.equal("defaults" in s.effective, false);
  assert.equal("showAllergens" in s.effective, false);
}
{
  // URL diet wins for DIET (per dimension); allergens still come from the defaults
  const s = withDefaults(parseFilters({ diet: "vegan" }), veg);
  assert.deepEqual(s.effective.diet, ["vegan"]);
  assert.deepEqual(s.effective.exclude, ["peanuts"]);
  assert.deepEqual(s.applied, { diet: [], exclude: ["peanuts"] });
}
{
  // ALLERGENS are UNIONED, never replaced: a hand-edited link cannot drop a saved allergy
  const s = withDefaults(parseFilters({ exclude: "soy" }), veg);
  assert.deepEqual([...s.effective.exclude!].sort(), ["peanuts", "soy"]);
  assert.deepEqual(s.effective.diet, ["vegetarian"]);
  // the URL asking for the same allergen is not duplicated
  const t = withDefaults(parseFilters({ exclude: "peanuts,soy" }), veg);
  assert.deepEqual([...t.effective.exclude!].sort(), ["peanuts", "soy"]);
  // exclude=<something else entirely> still keeps the default
  assert.ok(withDefaults(parseFilters({ exclude: "dairy" }), { diet: [], exclude: ["peanuts"] }).effective.exclude!.includes("peanuts"));
}
{
  // defaults=off switches the saved DIET off, and NOTHING ELSE: the saved allergen is still applied
  const url = parseFilters({ defaults: "off", diet: "vegan" });
  const s = withDefaults(url, veg);
  assert.deepEqual(s.effective, { diet: ["vegan"], exclude: ["peanuts"] });
  assert.deepEqual(s.applied, { diet: [], exclude: ["peanuts"] });
  assert.equal(s.dietOff, true);
  assert.equal(s.allergensShown, false);
  assert.deepEqual(s.saved, veg);
  // off with no diet in the URL: no diet at all, allergen still there
  const bare = withDefaults(parseFilters({ defaults: "off" }), veg);
  assert.deepEqual(bare.effective, { exclude: ["peanuts"] });
  // off with nothing saved is not "off" (nothing to show a chip for)
  assert.equal(withDefaults(parseFilters({ defaults: "off" }), null).dietOff, false);
  // off when only allergens are saved changes nothing
  const onlyAllergens = withDefaults(parseFilters({ defaults: "off" }), { diet: [], exclude: ["peanuts"] });
  assert.equal(onlyAllergens.dietOff, false);
  assert.deepEqual(onlyAllergens.effective.exclude, ["peanuts"]);
}
{
  // showAllergens=1 is the ONLY way past a saved allergen: the URL becomes literal for allergens
  const s = withDefaults(parseFilters({ showAllergens: "1" }), veg);
  assert.equal(s.allergensShown, true);
  assert.equal(s.effective.exclude, undefined);
  assert.deepEqual(s.effective.diet, ["vegetarian"]); // the diet is a separate choice
  assert.deepEqual(s.applied, { diet: ["vegetarian"], exclude: [] });
  assert.equal("showAllergens" in s.effective, false);
  // the URL's own allergen filters still apply while the saved ones are lifted
  const t = withDefaults(parseFilters({ showAllergens: "1", exclude: "soy" }), veg);
  assert.deepEqual(t.effective.exclude, ["soy"]);
  // anything but "1" is not an override; it cannot be switched on by accident
  for (const v of ["true", "yes", "on", "", "0", "1,2"]) {
    const o = withDefaults(parseFilters({ showAllergens: v }), veg);
    assert.equal(o.allergensShown, false, v);
    assert.deepEqual(o.effective.exclude, ["peanuts"], v);
  }
  // with no saved allergens the flag does nothing (and does not leak into the query)
  const d = withDefaults(parseFilters({ showAllergens: "1" }), { diet: ["vegan"], exclude: [] });
  assert.equal(d.allergensShown, false);
  assert.equal("showAllergens" in d.effective, false);
  // it is not a narrowing filter, and "clear filters" drops it
  assert.equal(hasActiveFilters(parseFilters({ showAllergens: "1" })), false);
  assert.equal(filtersToQuery(parseFilters({ showAllergens: "1", q: "x" })), "?q=x&showAllergens=1");
  assert.equal(withFilters(parseFilters({ showAllergens: "1" }), { showAllergens: undefined }).showAllergens, undefined);
  assert.equal(withoutNarrowing(parseFilters({ showAllergens: "1", q: "x", diet: "vegan" })).showAllergens, undefined);
  // the effective filters (and so the cache key) do not depend on how the allergens were lifted
  const viaFlag = withDefaults(parseFilters({ showAllergens: "1" }), veg).effective;
  const noSaved = withDefaults(parseFilters({}), { diet: ["vegetarian"], exclude: [] }).effective;
  assert.equal(filtersToQuery(viaFlag), filtersToQuery(noSaved));
}
{
  // only DIET saved, URL overrides it: nothing is applied any more
  const s = withDefaults(parseFilters({ diet: "vegan" }), { diet: ["vegetarian"], exclude: [] });
  assert.equal(s.applied, null);
  assert.deepEqual(s.effective.diet, ["vegan"]);
}
{
  // the effective filters never carry the `defaults` flag, so cache keys do not depend on how they were reached
  const a = withDefaults(parseFilters({ defaults: "off", diet: "vegetarian", exclude: "peanuts" }), veg).effective;
  const b = withDefaults(parseFilters({}), veg).effective;
  assert.equal(filtersToQuery(a), filtersToQuery(b));
}

// ---- parsing: `defaults` is "off" and nothing else ---------------------------------------------------------
assert.equal(parseFilters({ defaults: "off" }).defaults, "off");
for (const v of ["on", "OFF", "1", "true", "", "off,on"]) assert.equal(parseFilters({ defaults: v }).defaults, undefined, v);
assert.equal(parseFilters({ defaults: ["off", "x"] }).defaults, "off");
// ...and survives a round trip through the URL
assert.equal(filtersToQuery(parseFilters({ defaults: "off", q: "x" })), "?q=x&defaults=off");
assert.equal(filtersToQuery(parseFilters(new URLSearchParams("diet=vegan&defaults=off"))), "?diet=vegan&defaults=off");
// a chip link built with withFilters keeps it
assert.equal(withFilters(parseFilters({ defaults: "off" }), { maxTime: 30 }).defaults, "off");
assert.equal(withFilters(parseFilters({ defaults: "off" }), { defaults: undefined }).defaults, undefined);
// it is not a narrowing filter
assert.equal(hasActiveFilters(parseFilters({ defaults: "off" })), false);

// ---- hostile input ------------------------------------------------------------------------------------------
{
  const evil = parseFilters({ diet: "<script>", exclude: "a".repeat(80) + ",ok" });
  assert.equal(evil.diet, undefined);
  assert.deepEqual(evil.exclude, ["ok"]);
  const many = parseFilters({ exclude: Array.from({ length: 80 }, (_, i) => `a${i}`).join(",") });
  assert.equal(many.exclude!.length, 50);
  const nul = parseFilters({ diet: "vegan\u0000" });
  assert.equal(nul.diet, undefined);
}

// ---- toggling a chip -----------------------------------------------------------------------------------------
{
  // no defaults in force: the ordinary toggle, no `defaults` flag added
  const url = parseFilters({});
  const s = withDefaults(url, null);
  assert.equal(filtersToQuery(toggleFoodChip(url, s, "diet", "vegan")), "?diet=vegan");
  const d = withDefaults(parseFilters({}), veg);
  // a SAVED allergen is locked: the tap changes nothing (the page renders it as a fixed chip, not a link)
  assert.equal(isAllergenLocked(d, "peanuts"), true);
  assert.equal(isAllergenLocked(d, "soy"), false);
  const un = toggleFoodChip(parseFilters({}), d, "exclude", "peanuts"); // "uncheck peanuts"
  assert.deepEqual(un, parseFilters({}));
  assert.equal(un.defaults, undefined);
  // any other allergen is an ordinary toggle, and the saved one stays in force on the merged request
  const ad = toggleFoodChip(parseFilters({}), d, "exclude", "soy"); // "also soy"
  assert.deepEqual(ad.exclude, ["soy"]);
  assert.equal(ad.defaults, undefined);
  const again = withDefaults(parseFilters(serializeFilters(ad)), veg);
  assert.deepEqual([...again.effective.exclude!].sort(), ["peanuts", "soy"]);
  assert.deepEqual(again.effective.diet, ["vegetarian"]);
  // once the person has confirmed showAllergens, the same chip is an ordinary toggle again
  const shown = withDefaults(parseFilters({ showAllergens: "1" }), veg);
  assert.equal(isAllergenLocked(shown, "peanuts"), false);
  assert.deepEqual(toggleFoodChip(parseFilters({ showAllergens: "1" }), shown, "exclude", "peanuts").exclude, ["peanuts"]);
  // toggling the diet that is the default turns the DIET off; allergens are not touched and nothing is written to the URL for them
  const offDiet = toggleFoodChip(parseFilters({}), d, "diet", "vegetarian");
  assert.equal(offDiet.diet, undefined);
  assert.equal(offDiet.exclude, undefined);
  assert.equal(offDiet.defaults, "off");
  assert.deepEqual(withDefaults(parseFilters(serializeFilters(offDiet)), veg).effective, { exclude: ["peanuts"] });
  // cursor is dropped on any change
  assert.equal(toggleFoodChip(parseFilters({ cursor: "abc" }), d, "diet", "vegan").cursor, undefined);
}

// ---- the prefs cookie ---------------------------------------------------------------------------------------
{
  const enc = P.encodePrefs(veg, "3f2a9c11-aaaa-bbbb-cccc-1234567890ab");
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(P.decodePrefs(enc), veg);
  // order-insensitive and deduplicated on the way in
  assert.deepEqual(P.decodePrefs(P.encodePrefs({ diet: ["b", "a"], exclude: ["z", "z"] }, "ab")), { diet: ["a", "b"], exclude: ["z"] });
  // total: garbage is null, never a throw
  for (const bad of [undefined, null, "", "!!!", "e30", "a".repeat(2000), "%%%%", "bm90LWpzb24"]) {
    assert.equal(P.decodePrefs(bad as string), null, String(bad));
  }
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  assert.equal(P.decodePrefs(b64({ v: 3, d: [], x: [], u: "ab" })), null, "wrong version");
  assert.equal(P.decodePrefs(b64({ v: 1, d: ["<script>"], x: [], u: "ab" })), null, "bad slug");
  assert.equal(P.decodePrefs(b64({ v: 1, d: "vegan", x: [], u: "ab" })), null, "not an array");
  assert.equal(P.decodePrefs(b64({ v: 1, d: [], x: [], u: "ZZ" })), null, "bad user marker");
  assert.equal(P.decodePrefs(b64({ v: 1, d: Array.from({ length: 40 }, (_, i) => `d${i}`), x: [], u: "ab" })), null, "too many");
  // vocabulary: unknown slugs are dropped, and an empty result is null
  const vocab = { diets: ["vegetarian", "vegan"], allergens: ["peanuts"] };
  assert.deepEqual(P.restrictToVocab({ diet: ["vegetarian", "bogus"], exclude: ["peanuts", "nope"] }, vocab), veg);
  assert.equal(P.restrictToVocab({ diet: ["bogus"], exclude: [] }, vocab), null);
  assert.equal(P.restrictToVocab(null, vocab), null);
  // honoured only with a Supabase auth cookie present
  assert.equal(P.hasSupabaseAuthCookie(["sb-abc-auth-token"]), true);
  assert.equal(P.hasSupabaseAuthCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"]), true);
  assert.equal(P.hasSupabaseAuthCookie(["minced_prefs", "me_tz", "sb-abc-auth-token-code-verifier"]), false);
  assert.equal(P.hasSupabaseAuthCookie([]), false);
  // fingerprint
  assert.equal(P.prefsHash(null), "none");
  assert.equal(P.prefsHash({ diet: [], exclude: [] }), "none");
  assert.equal(P.prefsHash(veg), P.prefsHash({ diet: ["vegetarian"], exclude: ["peanuts"] }));
  assert.notEqual(P.prefsHash(veg), P.prefsHash({ diet: ["vegan"], exclude: ["peanuts"] }));
}

// ---- the chip label -------------------------------------------------------------------------------------------
{
  const names = {
    diets: new Map([["vegetarian", "Vegetarian"], ["gluten-free", "Gluten-free"]]),
    allergens: new Map([["peanuts", "Peanuts"], ["dairy", "Dairy"], ["egg", "Egg"]]),
  };
  assert.equal(P.prefsLabel(veg, names), "vegetarian, no peanuts");
  assert.equal(P.prefsLabel({ diet: [], exclude: ["peanuts", "dairy"] }, names), "no peanuts and dairy");
  assert.equal(P.prefsLabel({ diet: ["vegetarian", "gluten-free"], exclude: ["peanuts", "dairy", "egg"] }, names), "vegetarian, gluten-free, no peanuts, dairy and egg");
  assert.equal(P.prefsLabel({ diet: ["vegetarian"], exclude: [] }, names), "vegetarian");
  assert.equal(P.prefsLabel({ diet: ["mystery"], exclude: [] }, names), "mystery");
  assert.equal(P.prefsLabel({ diet: [], exclude: [] }, names), "");
  assert.equal(P.isEmptyDefaults(null), true);
}

// ---- Settings validators ----------------------------------------------------------------------------------------
{
  assert.deepEqual(V.validateDisplayName("  Ana   Maria\n"), { ok: true, value: "Ana Maria" });
  assert.deepEqual(V.validateDisplayName("   "), { ok: true, value: null }); // empty clears
  assert.deepEqual(V.validateDisplayName("a\u0000b\u0007c"), { ok: true, value: "a b c" }); // control chars -> space
  assert.equal(V.validateDisplayName("x".repeat(61)).ok, false);
  assert.equal(V.validateDisplayName("x".repeat(60)).ok, true);
  assert.equal(V.validateDisplayName(42).ok, false);
  assert.equal(V.validateDisplayName(null).ok, false);
  assert.equal(V.validateDisplayName({}).ok, false);

  const vocab = { diets: ["pescatarian", "vegetarian", "vegan", "gluten-free"], allergens: ["peanuts", "dairy"] };
  const ok = V.validateFoodDefaults({ diet: ["vegan", "gluten-free"], allergens: ["peanuts"] }, vocab);
  assert.deepEqual(ok, { ok: true, value: { diet: ["gluten-free", "vegan"], allergens: ["peanuts"] } }); // sorted
  assert.deepEqual(V.validateFoodDefaults({ diet: ["vegan", "vegan"], allergens: [] }, vocab), { ok: true, value: { diet: ["vegan"], allergens: [] } });
  assert.equal(V.validateFoodDefaults({ diet: ["vegan", "vegetarian"], allergens: [] }, vocab).ok, false, "one eating style");
  assert.equal(V.validateFoodDefaults({ diet: ["vegan", "pescatarian"], allergens: [] }, vocab).ok, false);
  assert.equal(V.validateFoodDefaults({ diet: ["keto"], allergens: [] }, vocab).ok, false, "unknown diet");
  assert.equal(V.validateFoodDefaults({ diet: [], allergens: ["bogus"] }, vocab).ok, false, "unknown allergen");
  assert.equal(V.validateFoodDefaults({ diet: "vegan", allergens: [] }).ok, false, "not an array");
  assert.equal(V.validateFoodDefaults({ diet: [], allergens: [1] }).ok, false, "not strings");
  assert.equal(V.validateFoodDefaults({ diet: ["<script>"], allergens: [] }).ok, false);
  assert.equal(V.validateFoodDefaults({ diet: ["a\u0000"], allergens: [] }).ok, false);
  assert.equal(V.validateFoodDefaults({ diet: [], allergens: Array.from({ length: 17 }, (_, i) => `a${i}`) }).ok, false, "17 allergens");
  assert.equal(V.validateFoodDefaults({ diet: [], allergens: Array.from({ length: 16 }, (_, i) => `a${i}`) }).ok, true, "16 allergens");
  assert.equal(V.validateFoodDefaults({ diet: [], allergens: Array.from({ length: 9999 }, (_, i) => `a${i}`) }).ok, false, "huge array");
  assert.equal(V.validateFoodDefaults(null).ok, false);
  assert.equal(V.validateFoodDefaults("x").ok, false);
  assert.equal(V.validateFoodDefaults(undefined).ok, false);

  assert.equal(V.oneOf("metric", V.UNITS), true);
  assert.equal(V.oneOf("Metric", V.UNITS), false);
  assert.equal(V.oneOf(null, V.SEXES), false);
  assert.equal(V.oneOf("saturday", V.WEEK_STARTS), false);

  assert.deepEqual(V.settingsFromRow(null), V.DEFAULT_SETTINGS);
  assert.deepEqual(V.settingsFromRow({ units: "imperial", week_start: "sunday", sex: "female", diet_slugs: ["vegan"], allergen_slugs: ["peanuts"] }), {
    units: "imperial", weekStart: "sunday", sex: "female", birthYear: null, diet: ["vegan"], allergens: ["peanuts"],
  });
  // a corrupt row degrades to the defaults instead of throwing
  assert.deepEqual(V.settingsFromRow({ units: "x", week_start: "y", sex: "z", diet_slugs: ["<b>"], allergen_slugs: null }), V.DEFAULT_SETTINGS);
}

console.log("filters-defaults tests: ok");

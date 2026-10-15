// Run: node --experimental-strip-types scripts/test-shopping.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
import assert from "node:assert/strict";
import { batchCount, groupByAisle, listStats, mergeLines, selectForList, type ShopLine } from "../src/lib/shopping.ts";

let n = 0;
const line = (o: Partial<ShopLine> & { ingredientId: number }): ShopLine => ({
  key: `k${++n}`,
  name: "thing",
  aisle: "Produce",
  quantity: 1,
  unit: null,
  unitKind: null,
  unitFactor: null,
  recipeSlug: null,
  recipeTitle: null,
  checked: false,
  ...o,
});
const TSP = { unit: "tsp", unitKind: "volume" as const, unitFactor: 4.92892 };
const TBSP = { unit: "tbsp", unitKind: "volume" as const, unitFactor: 14.7868 };
const CUP = { unit: "cup", unitKind: "volume" as const, unitFactor: 236.588 };
const G = { unit: "g", unitKind: "mass" as const, unitFactor: 1 };
const OZ = { unit: "oz", unitKind: "mass" as const, unitFactor: 28.3495 };
const CLOVE = { unit: "clove", unitKind: "count" as const, unitFactor: null };

const one = (ls: ShopLine[]) => {
  const m = mergeLines(ls);
  assert.equal(m.length, 1, `expected 1 merged row, got ${m.length}`);
  return m[0];
};

// 2 cloves + 3 cloves = 5 cloves, from two recipes.
{
  const m = one([
    line({ ingredientId: 1, name: "garlic", quantity: 2, ...CLOVE, recipeSlug: "a", recipeTitle: "A" }),
    line({ ingredientId: 1, name: "garlic", quantity: 3, ...CLOVE, recipeSlug: "b", recipeTitle: "B" }),
  ]);
  assert.equal(m.amount, 5);
  assert.equal(m.unit, "clove");
  assert.deepEqual(m.recipes.map((r) => r.slug), ["a", "b"]);
  assert.equal(m.keys.length, 2);
}

// 1 tbsp + 1 tsp = 4 tsp (not 1 1/3 tbsp).
{
  const m = one([line({ ingredientId: 2, quantity: 1, ...TBSP }), line({ ingredientId: 2, quantity: 1, ...TSP })]);
  assert.equal(m.amount, 4);
  assert.equal(m.unit, "tsp");
}

// 2 tsp + 1 tsp = 1 tbsp (clean promotion).
{
  const m = one([line({ ingredientId: 2, quantity: 2, ...TSP }), line({ ingredientId: 2, quantity: 1, ...TSP })]);
  assert.equal(m.amount, 1);
  assert.equal(m.unit, "tbsp");
}

// 4 tbsp + 4 tbsp = 1/2 cup; 8 tbsp is clean in cups.
{
  const m = one([line({ ingredientId: 2, quantity: 4, ...TBSP }), line({ ingredientId: 2, quantity: 4, ...TBSP })]);
  assert.equal(m.amount, 0.5);
  assert.equal(m.unit, "cup");
}

// 1 cup + 1 cup = 2 cup.
{
  const m = one([line({ ingredientId: 2, quantity: 1, ...CUP }), line({ ingredientId: 2, quantity: 1, ...CUP })]);
  assert.equal(m.amount, 2);
  assert.equal(m.unit, "cup");
}

// 1 cup + 1 tbsp = 17 tbsp (no clean cup fraction).
{
  const m = one([line({ ingredientId: 2, quantity: 1, ...CUP }), line({ ingredientId: 2, quantity: 1, ...TBSP })]);
  assert.equal(m.amount, 17);
  assert.equal(m.unit, "tbsp");
}

// Mass: 500 g + 500 g = 1 kg; 8 oz + 8 oz = 1 lb.
{
  const m = one([line({ ingredientId: 3, quantity: 500, ...G }), line({ ingredientId: 3, quantity: 500, ...G })]);
  assert.equal(m.amount, 1);
  assert.equal(m.unit, "kg");
  const m2 = one([line({ ingredientId: 3, quantity: 8, ...OZ }), line({ ingredientId: 3, quantity: 8, ...OZ })]);
  assert.equal(m2.amount, 1);
  assert.equal(m2.unit, "lb");
}

// Unconvertible stay separate: mass vs volume, clove vs bare count, to-taste vs measured.
{
  const m = mergeLines([
    line({ ingredientId: 4, quantity: 100, ...G }),
    line({ ingredientId: 4, quantity: 1, ...CUP }),
    line({ ingredientId: 4, quantity: 2, ...CLOVE }),
    line({ ingredientId: 4, quantity: 3 }),
    line({ ingredientId: 4, quantity: null }),
    line({ ingredientId: 4, quantity: null }),
  ]);
  assert.equal(m.length, 5, "g, cup, clove, bare, taste");
  const taste = m.find((x) => x.amount == null);
  assert.ok(taste);
  assert.equal(taste.keys.length, 2, "two to-taste lines fold into one row");
}

// Different ingredients never merge, even with the same unit.
assert.equal(
  mergeLines([line({ ingredientId: 5, quantity: 1, ...CUP }), line({ ingredientId: 6, quantity: 1, ...CUP })]).length,
  2,
);

// Bare counts merge: 2 eggs + 3 eggs.
assert.equal(one([line({ ingredientId: 7, quantity: 2 }), line({ ingredientId: 7, quantity: 3 })]).amount, 5);

// Float noise: 0.1 + 0.2 style sums are rounded.
assert.equal(
  one([line({ ingredientId: 8, quantity: 0.1, ...CLOVE }), line({ ingredientId: 8, quantity: 0.2, ...CLOVE })]).amount,
  0.3,
);

// Checked is true only when every underlying line is.
{
  const a = line({ ingredientId: 9, quantity: 1, ...CLOVE, checked: true });
  const b = line({ ingredientId: 9, quantity: 1, ...CLOVE, checked: false });
  assert.equal(one([a, b]).checked, false);
  assert.equal(one([{ ...a }, { ...b, checked: true }]).checked, true);
}

// Aisle grouping: fixed shopping order, unknown aisle becomes Other, names sorted.
{
  const items = mergeLines([
    line({ ingredientId: 10, name: "cumin", aisle: "Spices" }),
    line({ ingredientId: 11, name: "onion", aisle: "Produce" }),
    line({ ingredientId: 12, name: "carrot", aisle: "Produce" }),
    line({ ingredientId: 13, name: "mystery", aisle: "Bakery" }),
    line({ ingredientId: 14, name: "milk", aisle: "Dairy" }),
  ]);
  const g = groupByAisle(items);
  assert.deepEqual(g.map((x) => x.aisle), ["Produce", "Dairy", "Spices", "Other"]);
  assert.deepEqual(g[0].items.map((i) => i.name), ["carrot", "onion"]);
  const s = listStats(items);
  assert.equal(s.total, 5);
  assert.equal(s.gathered, 0);
}

// Stats: "N of M gathered from K recipes".
{
  const items = mergeLines([
    line({ ingredientId: 1, quantity: 1, ...CLOVE, recipeSlug: "a", recipeTitle: "A", checked: true }),
    line({ ingredientId: 2, quantity: 1, ...CLOVE, recipeSlug: "b", recipeTitle: "B" }),
    line({ ingredientId: 3, quantity: 1, ...CLOVE, recipeSlug: "a", recipeTitle: "A" }),
  ]);
  assert.deepEqual(listStats(items), { total: 3, gathered: 1, recipes: 2 });
}

// selectForList mirrors the SQL function.
{
  const rl = (o: object) => ({
    quantity: 1, unit: null, unitKind: null, unitFactor: null, name: "x", aisle: "Produce",
    ingredientId: 1, familyId: null, isStaple: false, ...o,
  });
  const lines = [
    rl({ name: "onion", ingredientId: 1, quantity: 2 }),
    rl({ name: "yellow onion", ingredientId: 2, familyId: 1 }),
    rl({ name: "salt", ingredientId: 3, isStaple: true }),
    rl({ name: "pepper", ingredientId: 4, quantity: null, unit: "tsp" }),
    rl({ name: "ghost", ingredientId: null }),
  ];
  const r = selectForList(lines, 2, 4, { skipStaples: true, have: new Set([1]) });
  assert.deepEqual(r.skippedHave, ["onion", "yellow onion"], "a parent in the fridge covers its variants");
  assert.equal(r.skippedStaples, 1);
  assert.deepEqual(r.add.map((l) => l.name), ["pepper"]);
  assert.equal(r.add[0].unit, null, "to-taste line drops its unit");

  const r2 = selectForList(lines, 2, 4, { skipStaples: false, have: new Set() });
  assert.deepEqual(r2.add.map((l) => l.name), ["onion", "yellow onion", "salt", "pepper"]);
  assert.equal(r2.add[0].quantity, 4, "2 onions for 2 servings => 4 for 4");
}

{
  // kung-pao-chicken style: soy sauce (7) and cornstarch (8) on two rows each.
  const recipe = [1, 7, 7, 8, 8, 9];
  const once = recipe.map((ingredientId) => ({ ingredientId }));
  assert.equal(batchCount([], recipe), 0, "not on the list");
  assert.equal(batchCount(once, recipe), 1, "one add of a recipe with repeated ingredients is 1 batch");
  assert.equal(batchCount([...once, ...once], recipe), 2, "after Add again it is 2 batches");
  assert.equal(batchCount(once.filter((l) => l.ingredientId !== 1), recipe), 1, "skipped lines do not matter");
}

console.log("shopping: all assertions passed");

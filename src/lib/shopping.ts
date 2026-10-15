/**
 * Shopping list logic. Pure functions, no React, no imports, so the maths is
 * tested in plain node (scripts/test-shopping.mts).
 *
 * The list is stored as RAW lines (one per recipe ingredient added) and MERGED
 * when displayed. Storing merged numbers would lose where each came from, so
 * removing a recipe or re-adding it at a new serving count would be arithmetic
 * on a number that no longer remembers its parts.
 */

export type UnitKind = "mass" | "volume" | "count";

/** One stored line. Same shape for account rows and the signed-out localStorage list. */
export type ShopLine = {
  /** Row id: the database id as a string, or a local uid. Opaque to this module. */
  key: string;
  ingredientId: number;
  name: string;
  aisle: string;
  /** null = "to taste". */
  quantity: number | null;
  /** Unit name as in `units.name`, or null for bare counts ("3 eggs"). */
  unit: string | null;
  unitKind: UnitKind | null;
  /** Multiply by this to reach the base unit of `unitKind` (ml / g). null for count units. */
  unitFactor: number | null;
  recipeSlug: string | null;
  recipeTitle: string | null;
  checked: boolean;
};

export type MergedItem = {
  /** Stable within one render: the first underlying key. */
  id: string;
  ingredientId: number;
  name: string;
  aisle: string;
  /** null = "to taste". */
  amount: number | null;
  unit: string | null;
  /** Every raw line folded into this row; toggling the row toggles all of them. */
  keys: string[];
  recipes: { slug: string; title: string }[];
  /** True only when every underlying line is checked. */
  checked: boolean;
};

export type AisleGroup = { aisle: string; items: MergedItem[] };

/** Shopping order: the walk through a shop, perishables first. */
export const AISLE_ORDER = ["Produce", "Protein", "Dairy", "Pantry", "Spices", "Other"] as const;

/* Ladders for choosing a friendly unit after summing. [name, size in the ladder's smallest unit]. */
const LADDERS: [string, number][][] = [
  [["tsp", 1], ["tbsp", 3], ["cup", 48]],
  [["g", 1], ["kg", 1000]],
  [["ml", 1], ["l", 1000]],
  [["oz", 1], ["lb", 16]],
];

/** 4 decimals, and snap to a whole number when conversion-factor noise (16.9999) is all that separates them. */
const round4 = (n: number) => {
  const whole = Math.round(n);
  return whole >= 1 && Math.abs(n - whole) < 0.001 ? whole : Math.round(n * 10000) / 10000;
};

/** Whole numbers are "clean"; cups also allow quarters (1/4 cup beats 4 tbsp). */
function isClean(value: number, unit: string): boolean {
  const step = unit === "cup" ? 0.25 : 1;
  const k = value / step;
  return Math.abs(k - Math.round(k)) < 0.001 && value >= step - 1e-9;
}

/**
 * Express `base` (a total in the smallest input unit, whose own size on its
 * ladder is `smallestUnit`) in the largest unit that reads cleanly:
 * 1 tbsp + 1 tsp = 4 tsp (4/3 tbsp is not clean), but 2 tsp + 1 tsp = 1 tbsp.
 * Units that are on no ladder (fl oz, pt, ...) stay as they are.
 */
function friendlyUnit(total: number, unit: string): { amount: number; unit: string } {
  const ladder = LADDERS.find((l) => l.some(([n]) => n === unit));
  if (!ladder) return { amount: round4(total), unit };
  const start = ladder.findIndex(([n]) => n === unit);
  let best = { amount: round4(total), unit };
  for (let i = start + 1; i < ladder.length; i++) {
    const ratio = ladder[i][1] / ladder[start][1];
    const v = total / ratio;
    if (isClean(v, ladder[i][0])) best = { amount: round4(v), unit: ladder[i][0] };
  }
  return best;
}

function bucketOf(l: ShopLine): string {
  if (l.quantity == null) return "taste";
  if (l.unit == null || l.unitKind === "count") return `count:${l.unit ?? ""}`;
  if (l.unitFactor == null) return `unit:${l.unit}`; // unknown conversion: never merge across units
  return l.unitKind ?? `unit:${l.unit}`; // mass | volume
}

/**
 * Fold raw lines into display rows. Same ingredient merges when the units are
 * convertible (mass with mass, volume with volume) or identical counts
 * (clove + clove, bare + bare). A mass and a volume of the same ingredient stay
 * as two rows: without a density there is no honest sum. "To taste" lines
 * collapse into one row per ingredient.
 */
export function mergeLines(lines: ShopLine[]): MergedItem[] {
  const buckets = new Map<string, ShopLine[]>();
  for (const l of lines) {
    const k = `${l.ingredientId}|${bucketOf(l)}`;
    const b = buckets.get(k);
    if (b) b.push(l);
    else buckets.set(k, [l]);
  }

  const out: MergedItem[] = [];
  for (const group of buckets.values()) {
    const first = group[0];
    let amount: number | null = null;
    let unit: string | null = first.unit;

    if (first.quantity != null) {
      const convertible = first.unitKind === "mass" || first.unitKind === "volume";
      if (convertible && first.unitFactor != null) {
        // Smallest input unit is the unit we sum in; then promote if it reads cleanly.
        const smallest = group.reduce((a, b) => ((b.unitFactor ?? Infinity) < (a.unitFactor ?? Infinity) ? b : a));
        const baseTotal = group.reduce((s, l) => s + (l.quantity ?? 0) * (l.unitFactor ?? 0), 0);
        const inSmallest = baseTotal / (smallest.unitFactor as number);
        const f = friendlyUnit(inSmallest, smallest.unit as string);
        amount = f.amount;
        unit = f.unit;
      } else {
        amount = round4(group.reduce((s, l) => s + (l.quantity ?? 0), 0));
      }
    } else {
      unit = null;
    }

    const recipes: { slug: string; title: string }[] = [];
    for (const l of group) {
      if (l.recipeSlug && l.recipeTitle && !recipes.some((r) => r.slug === l.recipeSlug)) {
        recipes.push({ slug: l.recipeSlug, title: l.recipeTitle });
      }
    }

    out.push({
      id: first.key,
      ingredientId: first.ingredientId,
      name: first.name,
      aisle: first.aisle,
      amount,
      unit,
      keys: group.map((l) => l.key),
      recipes,
      checked: group.every((l) => l.checked),
    });
  }
  return out;
}

/** Units that are bought as they are counted: "2 cans", "1 head". Anything else is not a count. */
const BUYABLE_UNITS = new Set(["can", "bunch", "head"]);

/** What the shopping screen shows per ingredient. No measurements: you buy whole items. */
export type BuyItem = Omit<MergedItem, "amount" | "unit"> & {
  /** "6" for bare counts ("eggs"), "2 cans" for bought units, null when a count would be noise. */
  count: string | null;
};

/**
 * Collapse merged rows to one row per ingredient and drop the measurements.
 * "1 1/2 cups milk" and "2 tbsp milk" are both just "milk": you buy a carton, and the recipe
 * says how much to pour. A count survives only where the thing is bought by the piece:
 * bare counts (eggs, lemons: always rounded UP, you cannot buy 2.5) and cans, bunches, heads.
 */
export function buyList(items: MergedItem[]): BuyItem[] {
  const byIngredient = new Map<number, MergedItem[]>();
  for (const it of items) {
    const list = byIngredient.get(it.ingredientId);
    if (list) list.push(it);
    else byIngredient.set(it.ingredientId, [it]);
  }
  const out: BuyItem[] = [];
  for (const group of byIngredient.values()) {
    const first = group[0];
    const bare = group.filter((g) => g.amount != null && g.unit == null);
    const bought = group.filter((g) => g.amount != null && g.unit != null && BUYABLE_UNITS.has(g.unit));
    let count: string | null = null;
    if (bought.length > 0) {
      const unit = bought[0].unit as string;
      const n = Math.max(1, Math.ceil(bought.filter((g) => g.unit === unit).reduce((s, g) => s + (g.amount ?? 0), 0) - 1e-9));
      count = `${n} ${n === 1 ? unit : `${unit}s`}`.replace("bunchs", "bunches");
    } else if (bare.length > 0) {
      const n = Math.max(1, Math.ceil(bare.reduce((s, g) => s + (g.amount ?? 0), 0) - 1e-9));
      // "1" next to "garlic" says nothing; a count is worth showing from 2.
      count = n >= 2 ? String(n) : null;
    }
    const recipes: { slug: string; title: string }[] = [];
    for (const g of group) for (const r of g.recipes) if (!recipes.some((x) => x.slug === r.slug)) recipes.push(r);
    out.push({
      id: first.id,
      ingredientId: first.ingredientId,
      name: first.name,
      aisle: first.aisle,
      keys: group.flatMap((g) => g.keys),
      recipes,
      checked: group.every((g) => g.checked),
      count,
    });
  }
  return out;
}

export type BuyGroup = { aisle: string; items: BuyItem[] };

export function groupBuyByAisle(items: BuyItem[]): BuyGroup[] {
  const byAisle = new Map<string, BuyItem[]>();
  for (const it of items) {
    const a = (AISLE_ORDER as readonly string[]).includes(it.aisle) ? it.aisle : "Other";
    const list = byAisle.get(a);
    if (list) list.push(it);
    else byAisle.set(a, [it]);
  }
  return AISLE_ORDER.filter((a) => byAisle.has(a)).map((aisle) => ({
    aisle,
    items: (byAisle.get(aisle) as BuyItem[]).sort((x, y) => x.name.localeCompare(y.name)),
  }));
}

export function groupByAisle(items: MergedItem[]): AisleGroup[] {
  const byAisle = new Map<string, MergedItem[]>();
  for (const it of items) {
    const a = (AISLE_ORDER as readonly string[]).includes(it.aisle) ? it.aisle : "Other";
    const list = byAisle.get(a);
    if (list) list.push(it);
    else byAisle.set(a, [it]);
  }
  return AISLE_ORDER.filter((a) => byAisle.has(a)).map((aisle) => ({
    aisle,
    items: (byAisle.get(aisle) as MergedItem[]).sort(
      (x, y) => x.name.localeCompare(y.name) || (x.unit ?? "").localeCompare(y.unit ?? ""),
    ),
  }));
}

export type ListStats = { total: number; gathered: number; recipes: number };

export function listStats(items: Pick<MergedItem, "recipes" | "checked">[]): ListStats {
  const slugs = new Set<string>();
  for (const it of items) for (const r of it.recipes) slugs.add(r.slug);
  return {
    total: items.length,
    gathered: items.filter((i) => i.checked).length,
    recipes: slugs.size,
  };
}

/** A recipe line as the recipe page holds it (the subset adding needs). */
export type RecipeLineInput = {
  quantity: number | null;
  unit: string | null;
  unitKind: UnitKind | null;
  unitFactor: number | null;
  name: string;
  aisle: string;
  ingredientId?: number | null;
  familyId?: number | null;
  isStaple?: boolean;
};

/** Does the fridge cover this line? A parent in the fridge covers its variants (same rule as match_recipes). */
export function coveredByFridge(line: RecipeLineInput, have: ReadonlySet<number>): boolean {
  return (
    (line.ingredientId != null && have.has(line.ingredientId)) ||
    (line.familyId != null && have.has(line.familyId))
  );
}

export type AddSelection = {
  /** Lines to add, quantities scaled to the target servings. */
  add: (RecipeLineInput & { ingredientId: number })[];
  skippedStaples: number;
  /** Names skipped because they are in the fridge (staples are not listed here when skipped as staples). */
  skippedHave: string[];
};

/**
 * How many times one recipe's batch is on the list. A recipe can list the same
 * ingredient on several rows (soy sauce in the marinade and the sauce), so one
 * batch already holds that many rows. Divide each ingredient's rows on the list
 * by its rows in the recipe, and take the largest result. 0 = not on the list.
 * `recipeIngredientIds` has one entry per row of the recipe's ingredient list.
 */
export function batchCount(
  listed: { ingredientId: number }[],
  recipeIngredientIds: number[],
): number {
  const base = new Map<number, number>();
  for (const id of recipeIngredientIds) base.set(id, (base.get(id) ?? 0) + 1);
  const onList = new Map<number, number>();
  for (const l of listed) onList.set(l.ingredientId, (onList.get(l.ingredientId) ?? 0) + 1);
  let max = 0;
  for (const [id, n] of onList) {
    const batches = Math.ceil(n / (base.get(id) ?? 1));
    if (batches > max) max = batches;
  }
  return max;
}

/** Mirror of add_recipe_to_shopping_list() for the signed-out list. Keep the two in step. */
export function selectForList(
  lines: RecipeLineInput[],
  baseServings: number,
  servings: number,
  opts: { skipStaples: boolean; have: ReadonlySet<number> },
): AddSelection {
  const add: AddSelection["add"] = [];
  const skippedHave: string[] = [];
  let skippedStaples = 0;
  for (const l of lines) {
    if (l.ingredientId == null) continue;
    if (opts.skipStaples && l.isStaple) {
      skippedStaples++;
      continue;
    }
    if (coveredByFridge(l, opts.have)) {
      skippedHave.push(l.name);
      continue;
    }
    const q = l.quantity == null ? null : round4((l.quantity * servings) / (baseServings > 0 ? baseServings : 1));
    add.push({ ...l, ingredientId: l.ingredientId, quantity: q, unit: q == null ? null : l.unit });
  }
  return { add, skippedStaples, skippedHave };
}

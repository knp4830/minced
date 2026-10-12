/**
 * Which colour a photo-less recipe tile gets. Pure and deterministic: the same
 * recipe always lands on the same tone, with no randomness and no stored state.
 *
 * Source of the choice, in order:
 *   1. cuisine, when the recipe has one (hashed onto the tone list; cuisine is
 *      NULL on every imported USDA recipe, so this mostly serves the originals);
 *   2. the aisle of the main ingredient: Produce is greens and cool tints,
 *      Protein is warm paprika or clay, Dairy is saffron, and so on, with the
 *      slug choosing within the aisle's family;
 *   3. a hash of the slug, so a recipe with neither still gets a stable tone.
 *
 * The tones themselves are tokens in globals.css (--color-ph-*); nothing here
 * knows a colour value.
 */

export const PLACEHOLDER_TONES = ["herb", "paprika", "saffron", "clay", "sage", "slate"] as const;
export type PlaceholderTone = (typeof PLACEHOLDER_TONES)[number];

/**
 * Each aisle owns a small family of tones, and the slug picks within it. Produce
 * alone is ~60% of the catalog, so one green for all of it would paint most of a
 * grid the same colour.
 */
const AISLE_TONES: Record<string, PlaceholderTone[]> = {
  Produce: ["herb", "sage", "slate"],
  Protein: ["paprika", "clay"],
  Dairy: ["saffron", "clay"],
  Pantry: ["clay", "saffron"],
  Spices: ["paprika", "clay"],
  Other: ["sage", "slate"],
};

/** FNV-1a. Small, stable across runtimes, no dependency. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function placeholderTone(input: {
  slug: string;
  cuisine?: string | null;
  aisle?: string | null;
}): PlaceholderTone {
  if (input.cuisine) {
    return PLACEHOLDER_TONES[hashString(input.cuisine.toLowerCase()) % PLACEHOLDER_TONES.length];
  }
  const family = input.aisle ? AISLE_TONES[input.aisle] : undefined;
  if (family) return family[hashString(input.slug) % family.length];
  return PLACEHOLDER_TONES[hashString(input.slug) % PLACEHOLDER_TONES.length];
}

type IngredientRow = {
  sort_order: number;
  is_optional: boolean;
  ingredients: { aisle_category: string; is_pantry_staple: boolean } | null;
};

/** The aisles that name what a dish IS, as opposed to what seasons it. */
const MAIN_AISLES = new Set(["Protein", "Produce", "Dairy"]);

/**
 * The aisle of a recipe's main ingredient: the first required, non-staple
 * ingredient from Protein / Produce / Dairy; failing that, the first required
 * non-staple ingredient of any aisle. Null when there is nothing to go on.
 */
export function primaryAisle(rows: IngredientRow[] | null | undefined): string | null {
  const real = (rows ?? [])
    .filter((r) => r.ingredients && !r.is_optional && !r.ingredients.is_pantry_staple)
    .sort((a, b) => a.sort_order - b.sort_order);
  const main = real.find((r) => MAIN_AISLES.has(r.ingredients!.aisle_category));
  return (main ?? real[0])?.ingredients?.aisle_category ?? null;
}

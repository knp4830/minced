import combosData from "@/data/combos.json";

/**
 * Ingredient combinations behind /what-can-i-make/[combo] (M3.7).
 *
 * The list is committed data (src/data/combos.json), produced by
 * scripts/seo/combos.sql against a database snapshot. It is not computed at
 * request time: the set of URLs has to be stable for the sitemap and for
 * generateStaticParams. `ids` are canonical ingredient ids, already rolled up
 * to their family parent (onion, not yellow onion), in display order.
 */
export type Combo = {
  slug: string;
  ids: number[];
  names: string[];
  /** Published recipes that used every ingredient when the list was built. */
  count: number;
};

const COMBOS = combosData as Combo[];
const BY_SLUG = new Map(COMBOS.map((c) => [c.slug, c]));

export function allCombos(): readonly Combo[] {
  return COMBOS;
}

export function getCombo(slug: string): Combo | null {
  return BY_SLUG.get(slug) ?? null;
}

/** "a", "a and b", "a, b, and c". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function comboHeading(combo: Combo): string {
  return `What can I make with ${joinNames(combo.names)}?`;
}

/** Path of the combo page. */
export function comboPath(combo: Combo): string {
  return `/what-can-i-make/${combo.slug}`;
}

/** Same ingredients as a pantry link: /pantry opens with them already picked. */
export function comboPantryHref(combo: Combo): string {
  return `/pantry?pantry=${combo.ids.join(",")}`;
}

/** Other combos that share an ingredient, biggest first. Links the pages together. */
export function relatedCombos(combo: Combo, limit = 8): Combo[] {
  const mine = new Set(combo.ids);
  return COMBOS.filter((c) => c.slug !== combo.slug && c.ids.some((id) => mine.has(id)))
    .map((c) => ({ c, shared: c.ids.filter((id) => mine.has(id)).length }))
    .sort((a, b) => b.shared - a.shared || b.c.count - a.c.count)
    .slice(0, limit)
    .map((x) => x.c);
}

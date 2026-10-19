/*
 * What a recipe page says about allergens, built from the derived tables.
 *
 * recipe_allergens          allergens that come from at least one REQUIRED ingredient line
 * recipe_optional_allergens allergens that come ONLY from optional lines (optional, garnish)
 *
 * Pure (no database, no React) so the same logic can be checked by scripts/test-allergens.mts.
 */

export type AllergenBasis = "inherent" | "typical" | "varies";

export type AllergenInfo = {
  slug: string;
  name: string;
  /** How sure the tag is: inherent / typical read "Contains", varies reads "May contain". */
  basis: AllergenBasis;
  /** True when every ingredient carrying it is optional: the recipe is fine without it. */
  optionalOnly: boolean;
  /** Ingredient names that carry it (required lines for a plain allergen, the optional lines for optionalOnly). */
  sources: string[];
};

export type AllergenRow = { basis: AllergenBasis; allergens: { slug: string; name: string } | null };

export type AllergenLine = {
  name: string;
  optional: boolean;
  /** Slugs of the allergens this ingredient carries (ingredient_allergens). */
  allergenSlugs: string[];
};

/** Required allergens first (A to Z), then the optional-only ones. */
export function buildAllergenInfo(
  required: readonly AllergenRow[],
  optionalOnly: readonly AllergenRow[],
  lines: readonly AllergenLine[],
): AllergenInfo[] {
  const sourcesOf = (slug: string, wantOptional: boolean | null): string[] => {
    const out: string[] = [];
    for (const l of lines) {
      if (!l.allergenSlugs.includes(slug)) continue;
      if (wantOptional !== null && l.optional !== wantOptional) continue;
      if (l.name && !out.includes(l.name)) out.push(l.name);
    }
    return out;
  };

  const req: AllergenInfo[] = [];
  for (const r of required) {
    if (!r.allergens) continue;
    const { slug, name } = r.allergens;
    // Ingredient lines are flagged optional by the stored flag; the garnish rule lives in the database, so when
    // the required list is empty for a slug we fall back to every line that carries it.
    const sources = sourcesOf(slug, false);
    req.push({ slug, name, basis: r.basis, optionalOnly: false, sources: sources.length ? sources : sourcesOf(slug, null) });
  }
  const opt: AllergenInfo[] = [];
  for (const r of optionalOnly) {
    if (!r.allergens) continue;
    const { slug, name } = r.allergens;
    if (req.some((a) => a.slug === slug)) continue;
    opt.push({ slug, name, basis: r.basis, optionalOnly: true, sources: sourcesOf(slug, null) });
  }
  const byName = (a: AllergenInfo, b: AllergenInfo) => a.name.localeCompare(b.name);
  return [...req.sort(byName), ...opt.sort(byName)];
}

/** "peanut butter and walnuts" / "milk, butter and eggs": for sentences about where an allergen comes from. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Lower-case a display name for a sentence ("Tree nuts" -> "tree nuts"). */
export function sentenceName(name: string): string {
  return name.toLowerCase();
}

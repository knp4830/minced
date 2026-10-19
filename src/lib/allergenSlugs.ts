/*
 * Allergen slugs that were split in wave 10c, and how an old value is read now.
 *
 * `nuts` was one allergen. It is now `peanuts` (a legume) and `tree-nuts`, and a link or a cookie that says `nuts`
 * must keep protecting the person who wrote it: it means BOTH.
 *
 * Applied wherever a slug list enters the app from outside the database: the `exclude` URL parameter and the prefs
 * cookie. The database itself was migrated in 20261018120000 (user_settings.allergen_slugs also widened an old
 * `shellfish` to `shellfish` + `mollusks`). The current `shellfish` means crustaceans only, so a plain URL value is NOT
 * widened; only a prefs cookie written BEFORE the split (version 1) is, see expandPreSplitAllergens.
 */
const LEGACY: Readonly<Record<string, readonly string[]>> = {
  nuts: ["peanuts", "tree-nuts"],
};

/** Replaces each legacy slug by the slugs it now stands for, de-duplicated, order kept. */
export function expandLegacyAllergens(slugs: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of slugs) {
    for (const e of LEGACY[s] ?? [s]) if (!out.includes(e)) out.push(e);
  }
  return out;
}

/**
 * A prefs cookie written before the split (version 1) said `shellfish` when clams, oysters and scallops were part of it.
 * Read it as both so a cookie that outlives the deploy (7 days) keeps protecting; version 2 cookies are read as written.
 */
export function expandPreSplitAllergens(slugs: readonly string[]): string[] {
  const out = expandLegacyAllergens(slugs);
  if (out.includes("shellfish") && !out.includes("mollusks")) out.push("mollusks");
  return out;
}

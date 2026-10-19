/*
 * Allergen slugs that were split in wave 10c, and how an old value is read now.
 *
 * `nuts` was one allergen. It is now `peanuts` (a legume) and `tree-nuts`, and a link or a cookie that says `nuts`
 * must keep protecting the person who wrote it: it means BOTH.
 *
 * Applied wherever a slug list enters the app from outside the database: the `exclude` URL parameter and the prefs
 * cookie. The database itself was migrated in 20261018120000 (user_settings.allergen_slugs also widened an old
 * `shellfish` to `shellfish` + `mollusks`; the current `shellfish` means crustaceans only, so it is NOT widened here).
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

import Link from "next/link";

import { ShowAllergensButton } from "@/components/recipe/allergenConfirm";
import { listNames } from "@/lib/listNames";
import { prefsHash, prefsLabel } from "@/lib/prefs";
import { filtersToQuery, withFilters, type DefaultsState, type RecipeFilters } from "@/lib/filters";
import type { FilterOptions } from "@/lib/queries/browse";

/*
 * "Your defaults: vegetarian, no nuts · Change · Turn off diet for this search", plus a short, kind note about
 * allergens.
 *
 * A Server Component (only the confirm button is client code). It keeps the saved diet / allergen defaults
 * VISIBLE at the point of use: a person should always be able to see why a list is shorter than they expected.
 * Used on both doors (/recipes and /pantry).
 *
 * The two halves are not equal. A saved DIET is a preference, so one tap switches it off for this search. Saved
 * ALLERGENS are a safety setting, so they stay hidden on every search and the only way past them is the explicit
 * "Show recipes with my allergens" button, which asks first (allergenConfirm.tsx) and puts `showAllergens=1` in
 * the URL for that search alone.
 *
 * It renders nothing for a signed-out visitor or someone with no defaults set (`state.saved` is null).
 */

const LINK =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md underline underline-offset-4 hover:text-herb focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-herb lg:min-h-0";

export function DefaultsChip({
  state,
  filters,
  options,
  base,
  className,
}: {
  state: DefaultsState;
  /** The URL's own filters (not the effective ones), so the toggle links keep exactly what is there. */
  filters: RecipeFilters;
  options: Pick<FilterOptions, "diets" | "allergens">;
  base: "/recipes" | "/pantry";
  className?: string;
}) {
  const saved = state.saved;
  if (!saved) return null;
  const href = (patch: Partial<RecipeFilters>) =>
    `${base}${filtersToQuery(withFilters(filters, patch)).replaceAll("%2C", ",")}`;

  const names = {
    diets: new Map(options.diets.map((d) => [d.slug, d.name])),
    allergens: new Map(options.allergens.map((a) => [a.slug, a.name])),
  };
  const allergenNames = saved.exclude.map((s) => (names.allergens.get(s) ?? s).toLowerCase());
  // Name what is really in force. When the URL picked its own diet, only the allergens are the defaults' doing.
  const inForce = state.applied ?? { diet: [], exclude: [] };
  const label = prefsLabel(inForce, names);
  const dietInForce = inForce.diet.length > 0;

  return (
    <div
      data-defaults-chip={state.allergensShown ? "shown" : state.dietOff && !label ? "off" : "on"}
      className={`rounded-md bg-band px-3 py-1 text-[0.8125rem] text-ink-muted ${className ?? ""}`}
    >
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0">
        {label && (
          <span>
            <span className="label-mono mr-1.5">Your defaults</span>
            <span className="text-ink">{label}</span>
          </span>
        )}
        {state.dietOff && <span>Your diet is off for this search.</span>}
        <span className="flex flex-wrap items-center gap-x-3">
          <Link href="/settings#food" className={LINK}>
            Change
          </Link>
          {dietInForce && (
            <Link href={href({ defaults: "off" })} scroll={false} prefetch={false} className={LINK}>
              Turn off diet for this search
            </Link>
          )}
          {state.dietOff && (
            <Link href={href({ defaults: undefined })} scroll={false} prefetch={false} className={LINK}>
              Use my diet
            </Link>
          )}
          {saved.exclude.length > 0 &&
            (state.allergensShown ? (
              <Link href={href({ showAllergens: undefined })} scroll={false} prefetch={false} className={LINK}>
                Hide them again
              </Link>
            ) : (
              <ShowAllergensButton href={href({ showAllergens: true })} names={allergenNames} className={LINK} />
            ))}
        </span>
      </p>
      {saved.exclude.length > 0 && (
        <p data-allergen-note className="pb-1.5 leading-snug">
          {state.allergensShown
            ? `Showing recipes that may contain ${listNames(allergenNames)}, for this search only.`
            : `Recipes with ${listNames(allergenNames)} stay hidden on every search, so nothing slips through while you browse. You can change this in Settings.`}
        </p>
      )}
    </div>
  );
}

/**
 * An invisible marker with a fingerprint of the defaults this page was rendered with. AccountProvider compares it
 * with what /api/me says the database holds and refreshes the page once if another device changed them.
 */
export function PrefsMarker({ state }: { state: DefaultsState }) {
  return <span hidden data-prefs-hash={prefsHash(state.saved)} />;
}

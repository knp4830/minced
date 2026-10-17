import Link from "next/link";

import { prefsHash, prefsLabel } from "@/lib/prefs";
import { filtersToQuery, withFilters, type DefaultsState, type RecipeFilters } from "@/lib/filters";
import type { FilterOptions } from "@/lib/queries/browse";

/*
 * "Your defaults: vegetarian, no nuts · Change · Turn off for this search".
 *
 * A Server Component with no client JavaScript. It keeps the saved diet / allergen defaults VISIBLE and
 * switchable at the point of use: a person should always be able to see why a list is shorter than they
 * expected, and to look past it in one tap. Used on both doors (/recipes and /pantry).
 *
 * It renders nothing for a signed-out visitor or someone with no defaults set (`state.saved` is null).
 */

const LINK =
  "inline-flex min-h-11 items-center rounded-md underline underline-offset-4 hover:text-herb focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-herb lg:min-h-0";

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
  if (!state.saved) return null;
  const href = (patch: Partial<RecipeFilters>) =>
    `${base}${filtersToQuery(withFilters(filters, patch)).replaceAll("%2C", ",")}`;

  if (state.off) {
    return (
      <p
        data-defaults-chip="off"
        className={`flex flex-wrap items-center gap-x-3 gap-y-0 rounded-md bg-band px-3 py-1 text-[0.8125rem] text-ink-muted ${className ?? ""}`}
      >
        <span>Your defaults are off for this search.</span>
        <Link href={href({ defaults: undefined })} scroll={false} prefetch={false} className={LINK}>
          Use them
        </Link>
      </p>
    );
  }

  const names = {
    diets: new Map(options.diets.map((d) => [d.slug, d.name])),
    allergens: new Map(options.allergens.map((a) => [a.slug, a.name])),
  };
  // Name what is really in force. When the URL picked its own diet, only the allergens are the defaults' doing.
  const shown = state.applied ?? state.saved;
  return (
    <p
      data-defaults-chip="on"
      className={`flex flex-wrap items-center gap-x-3 gap-y-0 rounded-md bg-band px-3 py-1 text-[0.8125rem] text-ink-muted ${className ?? ""}`}
    >
      <span>
        <span className="label-mono mr-1.5">Your defaults</span>
        <span className="text-ink">{prefsLabel(shown, names)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3">
        <Link href="/settings#food" className={LINK}>
          Change
        </Link>
        <Link href={href({ defaults: "off" })} scroll={false} prefetch={false} className={LINK}>
          Turn off for this search
        </Link>
      </span>
    </p>
  );
}

/**
 * An invisible marker with a fingerprint of the defaults this page was rendered with. AccountProvider compares it
 * with what /api/me says the database holds and refreshes the page once if another device changed them.
 */
export function PrefsMarker({ state }: { state: DefaultsState }) {
  return <span hidden data-prefs-hash={prefsHash(state.saved)} />;
}

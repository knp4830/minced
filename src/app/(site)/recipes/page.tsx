import type { Metadata } from "next";
import { cache, Suspense } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  activeFilterCount,
  ClearFilters,
  clearFiltersHref,
  FilterControls,
} from "@/components/recipe/filterPanel";
import { RememberList } from "@/components/recipe/rememberList";
import { CookwareSync } from "@/components/recipe/cookwareSync";
import { FilterSheet } from "@/components/recipe/filterSheet";
import { RecipeList } from "@/components/recipe/recipeList";
import {
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  resultFilters,
  withFilters,
  type DefaultsState,
  type RecipeFilters,
  type SearchParamsInput,
} from "@/lib/filters";
import { DefaultsChip, PrefsMarker } from "@/components/recipe/defaultsChip";
import { pageMeta } from "@/lib/seo/meta";
import { resolveDefaults } from "@/lib/prefsCookie";
import { getFilterOptions, getRecipePage } from "@/lib/queries/browse";
import { RecipeGridSkeleton } from "@/components/shell/skeletons";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters((await searchParams) as SearchParamsInput);
  const filtered = !!f.q || hasActiveFilters(f) || !!f.cursor;
  return {
    ...pageMeta({
      title: f.q ? `“${f.q}”` : "Recipes",
      path: "/recipes",
      description:
        "Every recipe is ingredients, amounts and numbered steps. Filter by time, ingredients, diet, allergens, calories, protein or the cookware you own.",
    }),
    // Search and filter URLs are infinite and thin; only the plain listing is indexable.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

function countLabel(total: number | null, lowerBound: boolean, hasQuery: boolean): string | null {
  if (total === null) return null;
  const n = lowerBound ? `${total}+` : String(total);
  const noun = total === 1 && !lowerBound ? "recipe" : "recipes";
  return hasQuery ? `${n} ${noun} found` : `${n} ${noun}`;
}

function EmptyState({ filters, defaults }: { filters: RecipeFilters; defaults: DefaultsState }) {
  const filtered = hasActiveFilters(filters);
  const byDiet = !!defaults.applied?.diet.length;
  const byAllergens = !!defaults.applied?.exclude.length;
  const byDefaults = byDiet || byAllergens;
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <h2 className="text-xl [overflow-wrap:anywhere]">
        {filters.q ? <>No recipes for “{filters.q}”</> : "No recipes match these filters"}
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
        {byDefaults
          ? `No recipes match these filters and your defaults.${byDiet ? " Turn off your diet to see more." : ""}${
              byAllergens ? " Your saved allergens stay hidden; the note above the list has the way to look past them for one search." : ""
            }`
          : filters.q
            ? "Check the spelling, or try one word, like “chickpea” or “soup”."
            : "Loosen a filter and the list grows back."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {byDiet && (
          <Link
            href={`/recipes${filtersToQuery(withFilters(filters, { defaults: "off" }))}`}
            scroll={false}
            className={buttonVariants({ variant: "primary", size: "md" })}
          >
            Turn off my diet
          </Link>
        )}
        {filtered && (
          <Link
            href={clearFiltersHref(filters)}
            className={buttonVariants({ variant: byDefaults ? "secondary" : "primary", size: "md" })}
          >
            Clear filters
          </Link>
        )}
        {filters.q && (
          <Link href="/recipes" className={buttonVariants({ variant: "secondary", size: "md" })}>
            Browse all recipes
          </Link>
        )}
      </div>
    </div>
  );
}

/** One page fetch per request, shared by the count line, the sheet button and the list. */
const pageFor = cache((filters: RecipeFilters) => getRecipePage(filters));

function showLabelFor(page: Awaited<ReturnType<typeof getRecipePage>>): string {
  if (page.total === null) return "Show recipes";
  const n = page.totalIsLowerBound ? `${page.total}+` : page.total;
  return `Show ${n} ${page.total === 1 && !page.totalIsLowerBound ? "recipe" : "recipes"}`;
}

async function ShowLabel({ filters }: { filters: RecipeFilters }) {
  return showLabelFor(await pageFor(filters));
}

async function CountLine({ filters }: { filters: RecipeFilters }) {
  const page = await pageFor(filters);
  const count = countLabel(page.total, page.totalIsLowerBound, !!filters.q);
  return count ? (
    <p className="mt-1 font-mono text-xs text-ink-muted" aria-live="polite">
      {count}
    </p>
  ) : null;
}

/**
 * Everything that waits on the database. Rendered inside a keyed <Suspense>.
 * `filters` is what is QUERIED (saved defaults merged in); `urlFilters` is what the address bar says, and every
 * link we build keeps the latter, so a shared link never carries the sender's defaults.
 */
async function Results({
  filters,
  urlFilters,
  defaults,
}: {
  filters: RecipeFilters;
  urlFilters: RecipeFilters;
  defaults: DefaultsState;
}) {
  const page = await pageFor(filters);
  const nextHref = page.nextCursor
    ? `/recipes${filtersToQuery({ ...urlFilters, cursor: page.nextCursor })}`
    : null;
  const unknown = [
    (filters.minTime !== undefined || filters.maxTime !== undefined) && "time",
    filters.spiceMax !== undefined && "spice level",
    (filters.calMin !== undefined ||
      filters.calMax !== undefined ||
      filters.proteinMin !== undefined) &&
      "nutrition data",
  ].filter(Boolean);
  const cookwareNote = filters.ownedOnly
    ? "Only recipes that need no cookware beyond yours. Recipes that list no cookware are included."
    : null;
  const unknownNote = unknown.length
    ? `Recipes with no listed ${unknown.join(" or ")} are included${filters.q ? ", after the ones that fit" : ""}.`
    : null;

  return (
    <>
      {page.fuzzy && (
        <p className="mb-4 rounded-md bg-band px-3 py-2 text-sm text-ink-muted">
          No recipe has those exact words. Showing the closest titles.
        </p>
      )}

      {cookwareNote && page.recipes.length > 0 && (
        <p className="mb-4 rounded-md bg-band px-3 py-2 text-sm text-ink-muted">{cookwareNote}</p>
      )}

      {unknownNote && page.recipes.length > 0 && (
        <p className="mb-4 rounded-md bg-band px-3 py-2 text-sm text-ink-muted">{unknownNote}</p>
      )}

      {filters.cursor && (
        <p className="mb-3">
          <Link
            href={`/recipes${filtersToQuery({ ...urlFilters, cursor: undefined })}`}
            className="inline-flex min-h-11 items-center text-sm text-ink-muted underline underline-offset-4 hover:text-herb"
          >
            Back to the first page
          </Link>
        </p>
      )}

      <RecipeList
        recipes={page.recipes}
        nextHref={nextHref}
        label={filters.q ? `Recipes matching ${filters.q}` : "Recipes"}
        empty={<EmptyState filters={urlFilters} defaults={defaults} />}
      />

      {filters.cursor && (
        <p className="mt-6 text-center">
          <Link
            href={`/recipes${filtersToQuery({ ...urlFilters, cursor: undefined })}`}
            className="inline-flex min-h-11 items-center text-sm text-ink-muted underline underline-offset-4 hover:text-herb"
          >
            Back to the first page
          </Link>
        </p>
      )}
    </>
  );
}

export default async function RecipesPage({ searchParams }: Props) {
  // `url` is what the address bar says (links, chips, the badge); `filters` is what is queried, with the
  // signed-in person's saved diet / allergen defaults merged in on the SERVER, before the first byte, so a
  // default allergen can never flash an unfiltered list. The cookie is read here, outside every cache.
  const url = parseFilters((await searchParams) as SearchParamsInput);
  const options = await getFilterOptions();
  const defaults = await resolveDefaults(url, options);
  const filters = defaults.effective;
  const activeCount = activeFilterCount(url);
  // Same-route navigations (a chip tap) do not trigger loading.tsx; a keyed
  // Suspense boundary does, so the list shows a skeleton while the chips and
  // the URL already reflect the tap.
  const resultsKey = filtersToQuery(resultFilters(filters));

  return (
    <div className="page-w py-6 md:py-8">
      <Suspense fallback={null}>
        <RememberList />
      </Suspense>
      <CookwareSync owned={url.ownedCookware ?? []} only={url.ownedOnly === true} />
      <PrefsMarker state={defaults} />
      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-0">
        {/* Desktop: sticky sidebar */}
        <aside
          aria-label="Filters"
          className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:border-r lg:border-line lg:pr-5"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[1.0625rem]">Filters</h2>
            <ClearFilters filters={url} />
          </div>
          <FilterControls filters={url} options={options} defaults={defaults} />
        </aside>

        <section aria-labelledby="results-h" className="min-w-0 lg:pl-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <h1 id="results-h" className="text-[1.75rem] leading-tight [overflow-wrap:anywhere] md:text-[2rem]">
                {filters.q ? <>Results for “{filters.q}”</> : "Recipes"}
              </h1>
              <Suspense key={resultsKey} fallback={<p className="mt-1 h-4" aria-hidden />}>
                <CountLine filters={filters} />
              </Suspense>
            </div>
            {filters.q && (
              <Link
                href={`/recipes${filtersToQuery({ ...url, q: undefined, cursor: undefined })}`}
                className="inline-flex min-h-11 items-center rounded-md text-sm text-ink-muted underline underline-offset-4 hover:text-herb lg:min-h-0"
              >
                Clear search
              </Link>
            )}
          </div>

          <DefaultsChip state={defaults} filters={url} options={options} base="/recipes" className="mb-4" />

          {/* Phone: "Filters" button opening a bottom sheet. Stays mounted across
              taps so it does not close; only its button label waits for data. */}
          <FilterSheet
            activeCount={activeCount}
            showLabel={
              <Suspense key={resultsKey} fallback="Show recipes">
                <ShowLabel filters={filters} />
              </Suspense>
            }
          >
            <div className="mb-3 flex justify-end">
              <ClearFilters filters={url} />
            </div>
            <FilterControls filters={url} options={options} defaults={defaults} />
          </FilterSheet>

          {/* Card titles are h3; this keeps the heading order h1 > h2 > h3 for screen readers (Lighthouse heading-order). */}
          <h2 className="sr-only">Recipe results</h2>
          <div data-results>
            <Suspense key={resultsKey} fallback={<RecipeGridSkeleton count={8} />}>
              <Results filters={filters} urlFilters={url} defaults={defaults} />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}

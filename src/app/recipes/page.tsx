import { SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  activeFilterCount,
  ClearFilters,
  clearFiltersHref,
  FilterControls,
} from "@/components/recipe/filterPanel";
import { RecipeList } from "@/components/recipe/recipeList";
import {
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  type RecipeFilters,
  type SearchParamsInput,
} from "@/lib/filters";
import { getFilterOptions, getRecipePage } from "@/lib/queries/browse";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters((await searchParams) as SearchParamsInput);
  const filtered = !!f.q || hasActiveFilters(f) || !!f.cursor;
  return {
    title: f.q ? `“${f.q}”` : "Recipes",
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

function EmptyState({ filters }: { filters: RecipeFilters }) {
  const filtered = hasActiveFilters(filters);
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <h2 className="text-xl">
        {filters.q ? <>No recipes for “{filters.q}”</> : "No recipes match these filters"}
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
        {filters.q
          ? "Check the spelling, or try one word, like “chickpea” or “soup”."
          : "Loosen a filter and the list grows back."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {filtered && (
          <Link
            href={clearFiltersHref(filters)}
            className={buttonVariants({ variant: "primary", size: "md" })}
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

export default async function RecipesPage({ searchParams }: Props) {
  const filters = parseFilters((await searchParams) as SearchParamsInput);
  const [page, options] = await Promise.all([getRecipePage(filters), getFilterOptions()]);

  const nextHref = page.nextCursor
    ? `/recipes${filtersToQuery({ ...filters, cursor: page.nextCursor })}`
    : null;
  const unknown = [
    filters.maxTime !== undefined && "a time",
    filters.spiceMax !== undefined && "a spice level",
    (filters.calMin !== undefined ||
      filters.calMax !== undefined ||
      filters.proteinMin !== undefined) &&
      "nutrition data",
  ].filter(Boolean);
  const unknownNote = unknown.length
    ? `Recipes with no listed ${unknown.join(" or ")} are included${filters.q ? ", after the ones that fit" : ""}.`
    : null;
  const count = countLabel(page.total, page.totalIsLowerBound, !!filters.q);
  const activeCount = activeFilterCount(filters);

  return (
    <div className="mx-auto max-w-[1400px] px-(--gutter) py-6 md:py-8">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        {/* Desktop: sticky sidebar */}
        <aside
          aria-label="Filters"
          className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-2"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[1.0625rem]">Filters</h2>
            <ClearFilters filters={filters} />
          </div>
          <FilterControls filters={filters} options={options} />
        </aside>

        <section aria-labelledby="results-h" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <h1 id="results-h" className="text-[1.75rem] leading-tight md:text-[2rem]">
                {filters.q ? <>Results for “{filters.q}”</> : "Recipes"}
              </h1>
              {count && (
                <p className="mt-1 font-mono text-xs text-ink-muted" aria-live="polite">
                  {count}
                </p>
              )}
            </div>
            {filters.q && (
              <Link
                href={`/recipes${filtersToQuery({ ...filters, q: undefined, cursor: undefined })}`}
                className="inline-flex min-h-11 items-center rounded-md text-sm text-ink-muted underline underline-offset-4 hover:text-herb lg:min-h-0"
              >
                Clear search
              </Link>
            )}
          </div>

          {/* Phone: filters in a disclosure above the list */}
          <details open={activeCount > 0} className="group mb-5 rounded-xl border border-line bg-surface lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[0.9375rem] font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal aria-hidden className="size-4" />
                Filters
                {activeCount > 0 && (
                  <span className="rounded-full bg-herb px-2 py-0.5 font-mono text-[0.6875rem] text-on-herb">
                    {activeCount}
                  </span>
                )}
              </span>
              <span aria-hidden className="font-mono text-xs text-ink-subtle group-open:hidden">
                show
              </span>
              <span aria-hidden className="hidden font-mono text-xs text-ink-subtle group-open:inline">
                hide
              </span>
            </summary>
            <div className="border-t border-line px-4 pt-4 pb-2">
              <FilterControls filters={filters} options={options} />
              <div className="-mt-2 mb-2">
                <ClearFilters filters={filters} />
              </div>
            </div>
          </details>

          {page.fuzzy && (
            <p className="mb-4 rounded-md bg-band px-3 py-2 text-sm text-ink-muted">
              No recipe has those exact words. Showing similar spellings.
            </p>
          )}

          {unknownNote && page.recipes.length > 0 && (
            <p className="mb-4 rounded-md bg-band px-3 py-2 text-sm text-ink-muted">
              {unknownNote}
            </p>
          )}

          <RecipeList
            recipes={page.recipes}
            nextHref={nextHref}
            label={filters.q ? `Recipes matching ${filters.q}` : "Recipes"}
            empty={<EmptyState filters={filters} />}
          />

          {filters.cursor && (
            <p className="mt-6 text-center">
              <Link
                href={`/recipes${filtersToQuery({ ...filters, cursor: undefined })}`}
                className="inline-flex min-h-11 items-center text-sm text-ink-muted underline underline-offset-4 hover:text-herb"
              >
                Back to the first page
              </Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

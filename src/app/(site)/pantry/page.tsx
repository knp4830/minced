import type { Metadata } from "next";
import { Suspense } from "react";
import { RememberList } from "@/components/recipe/rememberList";
import { FridgePicker } from "@/components/pantry/fridgePicker";
import { FridgeDatesLink, LocalFridgeImport } from "@/components/pantry/localFridgeImport";
import { daysUntilLabel, todayIso, urgencyOf } from "@/lib/fridgeDates";
import { getRecipeExpiryDays } from "@/lib/queries/fridge";
import { RecipeList } from "@/components/recipe/recipeList";
import {
  filtersToQuery,
  parseFilters,
  resultFilters,
  type RecipeFilters,
  type SearchParamsInput,
} from "@/lib/filters";
import { RecipeGridSkeleton } from "@/components/shell/skeletons";
import {
  activeFilterCount,
  ClearFilters,
  FilterControls,
} from "@/components/recipe/filterPanel";
import { CookwareSync } from "@/components/recipe/cookwareSync";
import { FilterSheet } from "@/components/recipe/filterSheet";
import { getCardExtras, getFilterOptions } from "@/lib/queries/browse";
import { getIngredientCatalog } from "@/lib/queries/ingredientCatalog";
import { getIngredientNames } from "@/lib/queries/ingredients";
import { matchRecipes } from "@/lib/queries/matcher";
import { usableImageUrl } from "@/lib/photos";

export const metadata: Metadata = {
  title: "What's in my fridge",
  description: "Every recipe that uses what you have, closest match first.",
  robots: { index: false, follow: true },
};

/**
 * One tap on a fridge item is enough, so the matcher is asked for everything
 * that uses at least one picked ingredient: no cap on how much a recipe may be
 * missing. Ranking (coverage, then more items used) does the sorting. `?maxMissing=`
 * in the URL still narrows it for anyone who wants that.
 */
const NO_MISSING_CAP = 1000;

/** The part that waits on the matcher. Rendered inside a keyed <Suspense>. */
async function Results({
  filters,
  fridgeParam,
  hasFridge,
}: {
  filters: RecipeFilters;
  fridgeParam: string;
  hasFridge: boolean;
}) {
  const byExpiry = filters.sort === "expiry";
  const base = { ...filters, maxMissing: filters.maxMissing ?? NO_MISSING_CAP };
  // "Use these first" is one page of up to 99 (the must-use ids already narrow
  // it a lot); reordering by expiry needs the whole page at once.
  const options = { pageSize: byExpiry ? 99 : 24, minHave: 1 };
  let result = await matchRecipes(byExpiry ? { ...base, cursor: undefined } : base, options);
  // The link asks for recipes using ALL the urgent items (soonest first). When no
  // recipe does, give up the later ones one at a time rather than show nothing.
  let dropped: number[] = [];
  if (byExpiry) {
    let use = filters.use ?? [];
    while (result.matches.length === 0 && use.length > 1) {
      dropped = [use[use.length - 1], ...dropped];
      use = use.slice(0, -1);
      result = await matchRecipes({ ...base, use, cursor: undefined }, options);
    }
  }
  // Signed out (or no dated items) gives an empty map: the order stays as ranked.
  const expiry = byExpiry
    ? await getRecipeExpiryDays(
        result.matches.map((m) => m.recipeId),
        todayIso(),
      )
    : new Map<string, { days: number; items: number }>();
  // Soonest-expiring first, then recipes that use more of the dated items;
  // ties keep the matcher's order (sort is stable).
  const matches = byExpiry
    ? [...result.matches].sort((a, b) => {
        const ea = expiry.get(a.recipeId);
        const eb = expiry.get(b.recipeId);
        return (ea?.days ?? Infinity) - (eb?.days ?? Infinity) || (eb?.items ?? 0) - (ea?.items ?? 0);
      })
    : result.matches;
  const extras = await getCardExtras(matches.map((m) => m.recipeId));
  const recipes = matches.map((m) => ({
    ...extras[m.recipeId],
    slug: m.slug,
    title: m.title,
    href: `/recipes/${m.slug}?pantry=${fridgeParam}`,
    imageUrl: extras[m.recipeId]?.imageUrl ?? usableImageUrl(m.imageUrl),
    totalTimeMin: m.totalTimeMin,
    servings: m.servings,
    calories: m.calories,
    coverage: {
      haveCount: m.haveCount,
      neededCount: m.neededCount,
      missingNames: m.missingNames,
    },
    useFirst: expiry.has(m.recipeId)
      ? {
          label: `Uses something ${daysUntilLabel(expiry.get(m.recipeId)!.days)}`,
          urgent: ["expired", "urgent"].includes(urgencyOf(expiry.get(m.recipeId)!.days)),
        }
      : undefined,
  }));

  const nextHref = !byExpiry && result.nextCursor
    ? `/pantry${filtersToQuery({ ...filters, cursor: result.nextCursor })}`
    : null;

  return (
    <>
      {hasFridge && (
        <h2 id="results-heading" className="mb-4 text-lg md:text-xl">
          {recipes.length === 0
            ? "No recipe uses these yet"
            : byExpiry
              ? `Using up what expires first · ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`
              : `Closest first${nextHref ? "" : ` · ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`}`}
        </h2>
      )}
      {byExpiry && dropped.length > 0 && recipes.length > 0 && (
        <p className="mb-4 max-w-[34em] text-[0.875rem] text-ink-muted">
          No recipe uses all of your soonest-expiring items, so these use the first
          {dropped.length === 1 ? "" : " ones"} and are ordered by what expires next.
        </p>
      )}
      <RecipeList
        label="Recipes that use what you have"
        recipes={recipes}
        nextHref={nextHref}
        empty={
          hasFridge ? (
            <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
              None of the recipes fit these filters. Try adding something else from the
              fridge, or loosen a filter.
            </p>
          ) : (
            <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
              Pick one thing or ten. Each recipe shows how many of its ingredients you have
              and exactly what&apos;s missing.
            </p>
          )
        }
      />
    </>
  );
}

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<Exclude<SearchParamsInput, URLSearchParams>>;
}) {
  const filters = parseFilters(await searchParams);
  const wanted = [...new Set([...(filters.pantry ?? []), ...(filters.use ?? [])])];

  const [catalog, options, names] = await Promise.all([
    getIngredientCatalog(),
    getFilterOptions(),
    getIngredientNames(wanted),
  ]);
  const hasFridge = names.length > 0;
  const fridgeParam = names.map((n) => n.id).join(",");
  // Fridge edits and cookware taps are same-route navigations, which do not
  // trigger loading.tsx; a keyed Suspense boundary shows the skeleton instead.
  const resultsKey = filtersToQuery(resultFilters(filters));

  return (
    <div className="mx-auto max-w-[1400px] px-(--gutter) py-8 md:py-12">
      <Suspense fallback={null}>
        <RememberList />
      </Suspense>
      <CookwareSync owned={filters.ownedCookware ?? []} only={filters.ownedOnly === true} />
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">What&apos;s in my fridge</h1>
      <p className="mt-2 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Tap what you have and see every recipe that uses any of it, closest match first. Salt,
        pepper, oil, butter, sugar, flour and water are assumed.
      </p>

      <LocalFridgeImport className="mt-5 max-w-[40rem]" />

      <FridgePicker className="mt-6 max-w-[40rem]" variant="page" catalog={catalog} initial={names} />
      <FridgeDatesLink className="mt-1" />

      <div className="mt-8 lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-0">
        {/* Same filters as browse: a rail on desktop, a sheet on phones. Nothing to filter until the fridge has something. */}
        {hasFridge && (
          <aside
            aria-label="Filters"
            className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:border-r lg:border-line lg:pr-5"
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[1.0625rem]">Filters</h2>
              <ClearFilters filters={filters} base="/pantry" />
            </div>
            <FilterControls filters={filters} options={options} base="/pantry" />
          </aside>
        )}

        <section
          aria-labelledby={hasFridge ? "results-heading" : undefined}
          aria-label={hasFridge ? undefined : "Recipes"}
          className={hasFridge ? "min-w-0 lg:pl-8" : "min-w-0"}
        >
          {hasFridge && (
            <FilterSheet activeCount={activeFilterCount(filters)} showLabel="Show recipes">
              <div className="mb-3 flex justify-end">
                <ClearFilters filters={filters} base="/pantry" />
              </div>
              <FilterControls filters={filters} options={options} base="/pantry" />
            </FilterSheet>
          )}
          <div data-results>
            <Suspense key={resultsKey} fallback={<RecipeGridSkeleton count={6} />}>
              <Results filters={filters} fridgeParam={fridgeParam} hasFridge={hasFridge} />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}

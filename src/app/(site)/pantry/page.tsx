import type { Metadata } from "next";
import { Suspense } from "react";
import { FridgePicker } from "@/components/pantry/fridgePicker";
import { RecipeList } from "@/components/recipe/recipeList";
import {
  filtersToQuery,
  parseFilters,
  type RecipeFilters,
  type SearchParamsInput,
} from "@/lib/filters";
import { RecipeGridSkeleton } from "@/components/shell/skeletons";
import { CookwareGroup } from "@/components/recipe/filterPanel";
import { getCardExtras, getFilterOptions } from "@/lib/queries/browse";
import { getIngredientCatalog } from "@/lib/queries/ingredientCatalog";
import { getIngredientNames } from "@/lib/queries/ingredients";
import { matchRecipes } from "@/lib/queries/matcher";
import { usableImageUrl } from "@/lib/photos";

export const metadata: Metadata = {
  title: "What's in my fridge",
  description: "Every recipe that uses what you have, closest match first.",
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
  const result = await matchRecipes(
    { ...filters, maxMissing: filters.maxMissing ?? NO_MISSING_CAP },
    { pageSize: 24, minHave: 1 },
  );
  const extras = await getCardExtras(result.matches.map((m) => m.recipeId));
  const recipes = result.matches.map((m) => ({
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
  }));

  const nextHref = result.nextCursor
    ? `/pantry${filtersToQuery({ ...filters, cursor: result.nextCursor })}`
    : null;

  return (
    <>
      {hasFridge && (
        <h2 id="results-heading" className="mb-4 text-lg md:text-xl">
          {recipes.length === 0
            ? "No recipe uses these yet"
            : `Closest first${nextHref ? "" : ` · ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`}`}
        </h2>
      )}
      <RecipeList
        label="Recipes that use what you have"
        recipes={recipes}
        nextHref={nextHref}
        empty={
          hasFridge ? (
            <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
              None of the recipes fit these filters. Try adding something else from the
              fridge{filters.cookware?.length ? ", or clear the cookware" : ""}.
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
  const resultsKey = filtersToQuery(filters);

  return (
    <div className="mx-auto max-w-[1180px] px-(--gutter) py-8 md:py-12">
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">What&apos;s in my fridge</h1>
      <p className="mt-2 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Tap what you have and see every recipe that uses any of it, closest match first. Salt,
        pepper, oil, butter, sugar, flour and water are assumed.
      </p>

      <FridgePicker className="mt-6 max-w-[40rem]" variant="page" catalog={catalog} initial={names} />

      {hasFridge && options.cookware.length > 0 && (
        <div className="mt-6 max-w-[40rem]">
          <CookwareGroup filters={filters} options={options} base="/pantry" />
        </div>
      )}

      <section aria-labelledby="results-heading" className="mt-8">
        <Suspense key={resultsKey} fallback={<RecipeGridSkeleton count={6} />}>
          <Results filters={filters} fridgeParam={fridgeParam} hasFridge={hasFridge} />
        </Suspense>
      </section>
    </div>
  );
}

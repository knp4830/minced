import type { Metadata } from "next";
import { FridgePicker } from "@/components/pantry/fridgePicker";
import { RecipeList } from "@/components/recipe/recipeList";
import { filtersToQuery, parseFilters, type SearchParamsInput } from "@/lib/filters";
import { getCardExtras } from "@/lib/queries/browse";
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

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<Exclude<SearchParamsInput, URLSearchParams>>;
}) {
  const filters = parseFilters(await searchParams);
  const wanted = [...new Set([...(filters.pantry ?? []), ...(filters.use ?? [])])];

  const [catalog, names, result] = await Promise.all([
    getIngredientCatalog(),
    getIngredientNames(wanted),
    matchRecipes(
      { ...filters, maxMissing: filters.maxMissing ?? NO_MISSING_CAP },
      { pageSize: 24, minHave: 1 },
    ),
  ]);
  const hasFridge = names.length > 0;
  const fridgeParam = names.map((n) => n.id).join(",");

  const extras = await getCardExtras(result.matches.map((m) => m.recipeId));
  const recipes = result.matches.map((m) => ({
    ...extras.get(m.recipeId),
    slug: m.slug,
    title: m.title,
    href: `/recipes/${m.slug}?pantry=${fridgeParam}`,
    imageUrl: extras.get(m.recipeId)?.imageUrl ?? usableImageUrl(m.imageUrl),
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
    <div className="mx-auto max-w-[1180px] px-(--gutter) py-8 md:py-12">
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">What&apos;s in my fridge</h1>
      <p className="mt-2 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Tap what you have and see every recipe that uses any of it, closest match first. Salt,
        pepper, oil, butter, sugar, flour and water are assumed.
      </p>

      <FridgePicker className="mt-6 max-w-[40rem]" variant="page" catalog={catalog} initial={names} />

      <section aria-labelledby="results-heading" className="mt-10">
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
                fridge.
              </p>
            ) : (
              <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
                Pick one thing or ten. Each recipe shows how many of its ingredients you have
                and exactly what&apos;s missing.
              </p>
            )
          }
        />
      </section>
    </div>
  );
}

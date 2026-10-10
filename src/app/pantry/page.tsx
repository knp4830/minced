import type { Metadata } from "next";
import { PantryInput } from "@/components/pantry/pantryInput";
import { RecipeList } from "@/components/recipe/recipeList";
import { filtersToQuery, parseFilters, type SearchParamsInput } from "@/lib/filters";
import { getIngredientNames } from "@/lib/queries/ingredients";
import { matchRecipes } from "@/lib/queries/matcher";

export const metadata: Metadata = {
  title: "What you can make",
  description: "Recipes ranked by how little your kitchen is missing.",
};

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<Exclude<SearchParamsInput, URLSearchParams>>;
}) {
  const filters = parseFilters(await searchParams);
  const wanted = [...new Set([...(filters.pantry ?? []), ...(filters.use ?? [])])];

  // "use" ids are implicitly in the pantry (match_recipes unions them), so show
  // them as chips even if the URL only listed them under `use`.
  const [names, result] = await Promise.all([
    getIngredientNames(wanted),
    matchRecipes(filters, { pageSize: 24 }),
  ]);
  const useIds = new Set(filters.use ?? []);
  const maxMissing = filters.maxMissing ?? 3;
  const hasPantry = names.length > 0;

  const recipes = result.matches.map((m) => ({
    slug: m.slug,
    title: m.title,
    imageUrl: m.imageUrl,
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
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">What you can make</h1>
      <p className="mt-2 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Salt, pepper, oil, butter, sugar, flour and water are assumed, so you
        don&apos;t need to list them.
      </p>

      <PantryInput
        variant="results"
        className="mt-6 max-w-[40rem]"
        initialItems={names}
        initialUse={names.filter((n) => useIds.has(n.id)).map((n) => n.id)}
        initialMaxMissing={maxMissing}
      />

      <section aria-labelledby="results-heading" className="mt-10">
        {hasPantry && (
          <h2 id="results-heading" className="mb-4 text-lg md:text-xl">
            {recipes.length === 0
              ? "Nothing close yet"
              : `Closest first${nextHref ? "" : ` · ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`}`}
          </h2>
        )}
        <RecipeList
          label="Recipes ranked by what you have"
          recipes={recipes}
          nextHref={nextHref}
          empty={
            hasPantry ? (
              <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
                No recipe is within {maxMissing === 0 ? "nothing" : maxMissing} missing
                ingredient{maxMissing === 1 ? "" : "s"} of this pantry. Allow a
                couple more missing, or add what else is in the kitchen.
              </p>
            ) : (
              <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
                Add three or four things you have and the closest recipes show up
                here, with exactly what each one is missing.
              </p>
            )
          }
        />
      </section>
    </div>
  );
}

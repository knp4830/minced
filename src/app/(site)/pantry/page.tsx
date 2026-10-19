import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CookwareSync } from "@/components/recipe/cookwareSync";
import { DefaultsChip, PrefsMarker } from "@/components/recipe/defaultsChip";
import { FilterSheet } from "@/components/recipe/filterSheet";
import { RememberList } from "@/components/recipe/rememberList";
import { FridgeGate } from "@/components/pantry/fridgeGate";
import { FridgePicker } from "@/components/pantry/fridgePicker";
import { FridgeResults, isGroupId } from "@/components/pantry/fridgeResults";
import { MakeNowSwitch } from "@/components/pantry/makeNowSwitch";
import { activeFilterCount, ClearFilters, FilterControls } from "@/components/recipe/filterPanel";
import { RecipeGridSkeleton } from "@/components/shell/skeletons";
import { filtersToQuery, parseFilters, resultFilters, type SearchParamsInput } from "@/lib/filters";
import { resolveDefaults } from "@/lib/prefsCookie";
import { getCurrentUser } from "@/lib/queries/account";
import { getFilterOptions } from "@/lib/queries/browse";
import { getFridge } from "@/lib/queries/fridge";
import { getIngredientCatalog } from "@/lib/queries/ingredientCatalog";

export const metadata: Metadata = {
  title: "Cook from what you have",
  description: "Every recipe that uses your fridge, grouped by how little you are missing.",
  robots: { index: false, follow: true },
};

/**
 * The fridge door (wave 10c). A fridge needs an account, so a signed-out visit gets the explanation and the
 * sign-in / create-account buttons, with nothing to tap. Signed in, the saved fridge (database, never the
 * browser) is the source: results are grouped Make now / Missing 1 / Missing 2 / Need a few more, soonest
 * expiring items first inside each group. Filters and the "only what I can make now" switch live in the URL.
 * Reads the session, so it is rendered per request and never cached.
 */
export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<Exclude<SearchParamsInput, URLSearchParams>>;
}) {
  const sp = await searchParams;
  // Old shared links (/pantry?pantry=11,85) carried the picks in the address. Fridges are account-only now, so
  // send those visitors to the ingredient filter that does the same job for everyone.
  const legacy = parseFilters(sp).pantry;
  if (legacy?.length) redirect(`/recipes?include=${legacy.join(",")}`);
  const user = await getCurrentUser();
  const catalog = await getIngredientCatalog();
  if (!user) return <FridgeGate next="/pantry" catalog={catalog} />;

  // `url` = the address bar; `filters` = what is queried (saved diet / allergen defaults merged in on the
  // server, the same call the browse page makes, so a default applies to both doors).
  const url = parseFilters(sp);
  const rawGroup = Array.isArray(sp.group) ? sp.group[0] : sp.group;
  const group = isGroupId(rawGroup) ? rawGroup : null;

  const [rows, options] = await Promise.all([getFridge(), getFilterOptions()]);
  const defaults = await resolveDefaults(url, options);
  const filters = defaults.effective;
  const hasFridge = rows.length > 0;
  const items = rows.map((r) => ({ id: r.ingredientId, name: r.name }));
  const nowOnly = url.now === true;
  // Fridge edits and cookware taps are same-route navigations, which do not trigger loading.tsx; a keyed
  // Suspense boundary shows the skeleton instead.
  const resultsKey = `${filtersToQuery(resultFilters(filters))}|${group ?? ""}|${rows.map((r) => `${r.ingredientId}:${r.expiresOn ?? ""}`).join(",")}`;

  return (
    <div className="page-w py-8 md:py-12">
      <Suspense fallback={null}>
        <RememberList />
      </Suspense>
      <CookwareSync owned={url.ownedCookware ?? []} only={url.ownedOnly === true} />
      <PrefsMarker state={defaults} />
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">Cook from what you have</h1>
      <p className="mt-2 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Every recipe that uses your fridge, grouped by how little you’re missing. Salt, pepper, oil, butter, sugar,
        flour and water are assumed. Recipes that use food expiring soon come first in each group.
      </p>

      <FridgePicker className="mt-6 max-w-[40rem]" variant="page" catalog={catalog} initial={items} />
      <Link
        href="/fridge"
        className="mt-1 inline-flex min-h-11 items-center text-[0.8125rem] font-medium underline underline-offset-4 hover:text-herb"
      >
        Dates and what to use first
      </Link>

      {hasFridge ? (
        <div className="mt-8 lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-0">
          {/* Same filters as browse: a rail on desktop, a sheet on phones. */}
          <aside
            aria-label="Filters"
            className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:border-r lg:border-line lg:pr-5"
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[1.0625rem]">Filters</h2>
              <ClearFilters filters={url} base="/pantry" />
            </div>
            <FilterControls filters={url} options={options} base="/pantry" defaults={defaults} />
          </aside>

          <section aria-label="Recipes for your fridge" className="min-w-0 lg:pl-8">
            <DefaultsChip state={defaults} filters={url} options={options} base="/pantry" className="mb-4" />
            <FilterSheet activeCount={activeFilterCount(url)} showLabel="Show recipes">
              <div className="mb-3 flex justify-end">
                <ClearFilters filters={url} base="/pantry" />
              </div>
              <FilterControls filters={url} options={options} base="/pantry" defaults={defaults} />
            </FilterSheet>
            <MakeNowSwitch on={nowOnly} className="mb-5" />
            <div data-results>
              <Suspense key={resultsKey} fallback={<RecipeGridSkeleton count={6} />}>
                <FridgeResults filters={filters} urlFilters={url} defaults={defaults} rows={rows} group={group} />
              </Suspense>
            </div>
          </section>
        </div>
      ) : (
        <p className="mt-8 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
          Your fridge is empty. Pick a few things and Minced shows what you can cook, with exactly what’s missing
          from each recipe.
        </p>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeList } from "@/components/recipe/recipeList";
import { JsonLd } from "@/components/seo/jsonLd";
import { buttonVariants } from "@/components/ui/button";
import {
  allCombos,
  comboHeading,
  comboPantryHref,
  comboPath,
  getCombo,
  joinNames,
  relatedCombos,
} from "@/lib/combos";
import { getCardExtras } from "@/lib/queries/browse";
import { matchRecipes } from "@/lib/queries/matcher";
import { usableImageUrl } from "@/lib/photos";
import { SITE_URL } from "@/lib/site";

/*
 * Programmatic SEO page: "What can I make with chicken, rice, and broccoli?"
 *
 * The URL set is the committed list in src/data/combos.json, built ahead of
 * time. Unknown slugs are a real 404 (`dynamicParams = false`) -- safe here,
 * unlike recipes, because the set only changes with a deploy. Content comes
 * from match_recipes (every recipe that uses ALL of the ingredients, fewest
 * missing first), cached by the matcher layer, and the page is refreshed hourly.
 */
export const revalidate = 3600;
export const dynamicParams = false;
export const generateStaticParams = async () => allCombos().map((c) => ({ combo: c.slug }));

const PAGE_SIZE = 24;
const NO_MISSING_CAP = 1000;

type Params = { combo: string };

function loadResult(ids: number[]) {
  // `use` makes every result contain all the ingredients; `pantry` scores them.
  return matchRecipes({ pantry: ids, use: ids, maxMissing: NO_MISSING_CAP }, { pageSize: PAGE_SIZE });
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const combo = getCombo((await params).combo);
  if (!combo) return { title: "Not found", robots: { index: false } };
  const { matches, nextCursor } = await loadResult(combo.ids);
  const n = nextCursor ? combo.count : matches.length;
  const title = comboHeading(combo);
  const description =
    n > 0
      ? `${n} recipe${n === 1 ? "" : "s"} use ${joinNames(combo.names)}. See what else each one needs, fewest missing ingredients first.`
      : `Recipes that use ${joinNames(combo.names)}.`;
  return {
    title,
    description,
    alternates: { canonical: comboPath(combo) },
    // A page with nothing on it (the catalog changed since the list was built) stays out of the index.
    robots: n > 0 ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: "website", url: comboPath(combo) },
  };
}

export default async function ComboPage({ params }: { params: Promise<Params> }) {
  const combo = getCombo((await params).combo);
  if (!combo) notFound();

  const { matches, nextCursor } = await loadResult(combo.ids);
  const extras = await getCardExtras(matches.map((m) => m.recipeId));
  const fridgeParam = combo.ids.join(",");
  const recipes = matches.map((m) => ({
    ...extras[m.recipeId],
    slug: m.slug,
    title: m.title,
    href: `/recipes/${m.slug}?pantry=${fridgeParam}`,
    imageUrl: extras[m.recipeId]?.imageUrl ?? usableImageUrl(m.imageUrl),
    totalTimeMin: m.totalTimeMin,
    servings: m.servings,
    calories: m.calories,
    coverage: { haveCount: m.haveCount, neededCount: m.neededCount, missingNames: m.missingNames },
  }));

  const total = nextCursor ? combo.count : matches.length;
  const list = joinNames(combo.names);
  const closest = matches[0];
  // What the shown recipes most often still ask for: a data-driven "what to buy".
  const tally = new Map<string, number>();
  for (const m of matches) for (const name of m.missingNames) tally.set(name, (tally.get(name) ?? 0) + 1);
  const often = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([name]) => name);

  const related = relatedCombos(combo);
  const pantryHref = comboPantryHref(combo);

  return (
    <div className="mx-auto max-w-[1400px] px-(--gutter) py-8 md:py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: comboHeading(combo),
          url: `${SITE_URL}${comboPath(combo)}`,
          numberOfItems: matches.length,
          itemListElement: matches.map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/recipes/${m.slug}`,
            name: m.title,
          })),
        }}
      />
      <h1 className="max-w-[24em] text-[1.75rem] leading-[1.1] md:text-[2.25rem]">{comboHeading(combo)}</h1>
      {total > 0 ? (
        <p className="mt-3 max-w-[38em] text-[0.9375rem] leading-relaxed text-ink-muted">
          {total} recipe{total === 1 ? "" : "s"} in the catalog use {list}.{" "}
          {closest && closest.missingCount === 0
            ? "The closest needs nothing else from the shop."
            : closest
              ? `The closest needs ${closest.missingCount} more ingredient${closest.missingCount === 1 ? "" : "s"}.`
              : ""}{" "}
          {often.length > 0 && <>Most often they also call for {joinNames(often)}. </>}
          Salt, pepper, oil, butter, sugar, flour and water are assumed.
        </p>
      ) : (
        <p className="mt-3 max-w-[38em] text-[0.9375rem] leading-relaxed text-ink-muted">
          No recipe in the catalog uses all of {list} yet. Try them one at a time in the fridge.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={pantryHref} className={buttonVariants({ variant: "primary" })}>
          Add more to my fridge
        </Link>
        <Link href="/recipes" className={buttonVariants({ variant: "secondary" })}>
          Search by name
        </Link>
      </div>

      <section aria-label="Recipes" className="mt-8">
        <RecipeList
          label={`Recipes with ${list}`}
          recipes={recipes}
          nextHref={nextCursor ? `/pantry?pantry=${fridgeParam}&use=${fridgeParam}` : null}
        />
      </section>

      {related.length > 0 && (
        <nav aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="text-lg md:text-xl">
            Other ingredient combinations
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {related.map((c) => (
              <li key={c.slug}>
                <Link
                  href={comboPath(c)}
                  className="inline-flex min-h-11 items-center rounded-full border border-outline px-4 text-[0.875rem] text-ink hover:border-herb hover:text-herb"
                >
                  {joinNames(c.names)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <Link
              href="/what-can-i-make"
              className="text-[0.875rem] text-ink-muted underline underline-offset-4 hover:text-herb"
            >
              All ingredient combinations
            </Link>
          </p>
        </nav>
      )}
    </div>
  );
}

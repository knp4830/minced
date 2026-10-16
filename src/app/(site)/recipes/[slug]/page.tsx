import { BackToResults } from "@/components/recipe/backToResults";
import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/account/favoriteButton";
import { LogThisButton } from "@/components/me/logThisButton";
import { JsonLd } from "@/components/seo/jsonLd";
import { Chip } from "@/components/ui/chip";
import { MetaRow } from "@/components/ui/metaRow";
import { RecipePlaceholder } from "@/components/recipe/recipePlaceholder";
import { ServingsScaler } from "@/components/recipe/servingsScaler";
import { AI_SOURCE_NAME, USER_SOURCE_NAME } from "@/lib/queries/browse";
import { getRecipeBySlug, type RecipeDetail } from "@/lib/queries/recipeDetail";
import { needsAttribution } from "@/lib/photos";
import { SITE_URL } from "@/lib/site";

/*
 * CACHING: incremental static regeneration, not build-time generation.
 *
 * A recipe page is identical for every visitor and changes rarely (a photo
 * lands, nutrition is recomputed), so it should be served from the CDN. But
 * pre-rendering all ~1,000 pages at build means ~1,000 database reads on every
 * deploy and a build that fails if the database is paused (it pauses after
 * inactivity). Instead: no pages are built ahead of time, the first visit to a
 * slug renders it once, and the result is cached for an hour, then refreshed in
 * the background. `dynamicParams` (default true) lets any slug through, and
 * unknown slugs 404 and are cached too.
 *
 * This only works because the data layer uses the cookie-free client; anything
 * that reads cookies() or searchParams here would silently make every request
 * a fresh render.
 */
export const revalidate = 3600;
export const generateStaticParams = async () => [];

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) return { title: "Recipe not found" };

  const bits = [
    `${recipe.ingredients.length} ingredients`,
    `${recipe.steps.length} steps`,
    recipe.totalTimeMin ? `${recipe.totalTimeMin} minutes` : null,
    `serves ${recipe.servings}`,
  ].filter(Boolean);

  const image = recipe.photo?.url ?? recipe.imageUrl ?? undefined;

  return {
    title: recipe.title,
    description: `${recipe.title}: ${bits.join(", ")}. Ingredients and steps, nothing else.`,
    alternates: { canonical: `/recipes/${recipe.slug}` },
    openGraph: {
      title: recipe.title,
      type: "article",
      images: image ? [image] : undefined,
    },
    // The root layout says "summary"; a real photo earns the large card.
    twitter: { card: image ? "summary_large_image" : "summary", title: recipe.title, images: image ? [image] : undefined },
  };
}

const round = (n: number, step: number) => Math.round(n / step) * step;

/** The four numbers people look for first. */
function nutritionHeadline(n: RecipeDetail["nutrition"]) {
  const rows: { label: string; value: string }[] = [];
  if (n.calories != null) rows.push({ label: "Calories", value: `${round(n.calories, 5)}` });
  if (n.proteinG != null) rows.push({ label: "Protein", value: `${Math.round(n.proteinG)} g` });
  if (n.carbsG != null) rows.push({ label: "Carbs", value: `${Math.round(n.carbsG)} g` });
  if (n.fatG != null) rows.push({ label: "Fat", value: `${Math.round(n.fatG)} g` });
  return rows;
}

/**
 * The label view. Daily values are the FDA's reference amounts for a 2,000 calorie diet.
 * Only nutrients the database holds are listed; nothing is invented.
 */
function nutritionLabel(n: RecipeDetail["nutrition"]) {
  const rows: { label: string; value: string; dv: number | null; indent?: boolean }[] = [];
  const pct = (v: number, daily: number) => Math.round((v / daily) * 100);
  if (n.fatG != null) rows.push({ label: "Total fat", value: `${Math.round(n.fatG)} g`, dv: pct(n.fatG, 78) });
  if (n.sodiumMg != null) rows.push({ label: "Sodium", value: `${round(n.sodiumMg, 10)} mg`, dv: pct(n.sodiumMg, 2300) });
  if (n.carbsG != null) rows.push({ label: "Total carbohydrate", value: `${Math.round(n.carbsG)} g`, dv: pct(n.carbsG, 275) });
  if (n.fiberG != null) rows.push({ label: "Dietary fiber", value: `${Math.round(n.fiberG)} g`, dv: pct(n.fiberG, 28), indent: true });
  if (n.proteinG != null) rows.push({ label: "Protein", value: `${Math.round(n.proteinG)} g`, dv: pct(n.proteinG, 50) });
  return rows;
}

const isoMinutes = (n: number | null) => (n ? `PT${Math.trunc(n)}M` : undefined);

/** schema.org/Recipe, so search engines can show time, calories and a photo in results. */
function recipeJsonLd(recipe: RecipeDetail) {
  const image = recipe.photo?.url ?? recipe.imageUrl;
  const n = recipe.nutrition;
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    url: `${SITE_URL}/recipes/${recipe.slug}`,
    ...(image ? { image: [image] } : {}),
    recipeYield: `${recipe.servings} servings`,
    ...(recipe.cuisine ? { recipeCuisine: recipe.cuisine } : {}),
    ...(recipe.totalTimeMin ? { totalTime: isoMinutes(recipe.totalTimeMin) } : {}),
    ...(recipe.prepTimeMin ? { prepTime: isoMinutes(recipe.prepTimeMin) } : {}),
    ...(recipe.cookTimeMin ? { cookTime: isoMinutes(recipe.cookTimeMin) } : {}),
    recipeIngredient: recipe.ingredients.map((i) =>
      [i.quantity != null ? String(Math.round(i.quantity * 100) / 100) : null, i.unit, i.name]
        .filter(Boolean)
        .join(" ") + (i.prepNote ? `, ${i.prepNote}` : ""),
    ),
    recipeInstructions: recipe.steps.map((text) => ({ "@type": "HowToStep", text })),
    ...(n.calories != null
      ? {
          nutrition: {
            "@type": "NutritionInformation",
            calories: `${Math.round(n.calories)} calories`,
            ...(n.proteinG != null ? { proteinContent: `${Math.round(n.proteinG)} g` } : {}),
            ...(n.carbsG != null ? { carbohydrateContent: `${Math.round(n.carbsG)} g` } : {}),
            ...(n.fatG != null ? { fatContent: `${Math.round(n.fatG)} g` } : {}),
            ...(n.fiberG != null ? { fiberContent: `${Math.round(n.fiberG)} g` } : {}),
            ...(n.sodiumMg != null ? { sodiumContent: `${Math.round(n.sodiumMg)} mg` } : {}),
          },
        }
      : {}),
  };
}

export default async function RecipePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const photoSrc = recipe.photo?.url ?? recipe.imageUrl;
  const isUsda = recipe.sourceName?.includes("MyPlate") ?? false;
  const isAi = recipe.sourceName === AI_SOURCE_NAME;
  const isUser = recipe.sourceName === USER_SOURCE_NAME;
  const nutrition = nutritionHeadline(recipe.nutrition);
  const label = nutritionLabel(recipe.nutrition);

  return (
    <article className="page-w pt-4 pb-6 md:pt-6">
      <JsonLd data={recipeJsonLd(recipe)} />
      <div className="flex items-center justify-between gap-3">
        <BackToResults />
        {/* Client island: keeps this page cacheable; the saved state fills in after load. */}
        <div className="flex items-center gap-2">
          <LogThisButton slug={recipe.slug} title={recipe.title} hasNutrition={recipe.nutrition.calories != null} />
          <FavoriteButton slug={recipe.slug} title={recipe.title} variant="detail" />
        </div>
      </div>

      {/*
        Hero: photo on the left, title and facts on the right, so the first screen on a big
        monitor is a large photo beside everything you need to decide. Below `lg` it stacks
        as title, photo, facts (DOM order), which is also the reading order.
      */}
      <div className="mt-2 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-[auto_1fr] xl:gap-x-14">
        <header className="lg:col-start-2 lg:row-start-1">
          {recipe.cuisine && <p className="label-mono mb-2 tracking-[0.1em]">{recipe.cuisine}</p>}
          <h1 className="text-[2rem] leading-[1.05] tracking-[-0.025em] sm:text-[2.5rem] xl:text-[3.25rem]">
            {recipe.title}
          </h1>
          <MetaRow
            size="md"
            className="mt-4 gap-x-3.5 border-y border-line-strong py-3 text-ink"
            time={recipe.totalTimeMin ?? undefined}
            servings={recipe.servings}
            calories={recipe.nutrition.calories != null ? round(recipe.nutrition.calories, 5) : undefined}
            spice={recipe.spiceLevel ?? undefined}
          />
          {recipe.allergens.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.08em] text-paprika-deep uppercase">
                <span aria-hidden className="size-1.5 rounded-full bg-paprika" />
                Contains
              </p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Allergens">
                {recipe.allergens.map((a) => (
                  <li
                    key={a}
                    className="rounded-full border border-paprika/30 bg-paprika/5 px-2.5 py-0.5 text-[0.75rem] leading-snug text-paprika-deep"
                  >
                    {a.toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isAi && (
            <p className="mt-3">
              <Link
                href="/about"
                className="inline-block rounded-xs bg-sunken px-2 py-1 font-mono text-[0.6875rem] text-ink-muted underline-offset-2 hover:text-herb hover:underline"
              >
                Drafted with AI, reviewed by Minced
              </Link>
            </p>
          )}
        </header>

        {/* Photo or colour block. On lg it stretches to the height of the facts beside it. */}
        <figure className="flex flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="relative aspect-[3/2] overflow-hidden rounded-xl border border-line bg-hatch md:aspect-[2/1] lg:aspect-auto lg:min-h-[24rem] lg:flex-1">
            {photoSrc ? (
              // Host varies by source (Storage / federal / Wikimedia): plain <img>.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt={recipe.photo?.altText ?? recipe.title}
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <RecipePlaceholder
                slug={recipe.slug}
                title={recipe.title}
                cuisine={recipe.cuisine}
                aisle={recipe.aisle}
                size="hero"
              />
            )}
          </div>
          {recipe.photo && needsAttribution(recipe.photo.license) && (
            <figcaption className="mt-2 font-mono text-[0.6875rem] leading-snug text-ink-muted">
              Photo: {recipe.photo.credit},{" "}
              <a
                href={recipe.photo.attributionUrl}
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-herb"
              >
                {recipe.photo.license}
              </a>
            </figcaption>
          )}
        </figure>

        {/* Facts: nutrition tiles, then diet, cookware and allergens in a wrapping row. */}
        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2">
          {nutrition.length > 0 && (
            <section
              aria-labelledby="nutrition-h"
              className="rounded-xl border border-line bg-band p-4"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="nutrition-h" className="label-mono">
                  Nutrition per serving
                </h2>
                <p className="font-mono text-[0.6875rem] text-ink-subtle">estimate · USDA data</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 min-[420px]:grid-cols-4">
                {nutrition.map((row) => (
                  <div key={row.label} className="min-w-0">
                    <dt className="text-[0.75rem] text-ink-muted">{row.label}</dt>
                    <dd className="font-mono text-[1.0625rem] font-semibold">~{row.value}</dd>
                  </div>
                ))}
              </dl>

              {label.length > 0 && (
                <details className="group mt-3 border-t border-line pt-2.5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xs text-[0.8125rem] font-semibold text-herb focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <span>More nutrition</span>
                    <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                  </summary>
                  {/* Nutrition-label layout: a heavy rule above, hairlines between rows. */}
                  <div className="mt-1 max-w-[22rem] rounded-md border border-ink bg-surface px-3 pt-2 pb-2.5 text-ink">
                    <p className="text-[1.125rem] font-extrabold tracking-tight">Nutrition facts</p>
                    <p className="text-[0.75rem] text-ink-muted">Per serving, estimated</p>
                    {recipe.nutrition.calories != null && (
                      <div className="mt-1 flex items-baseline justify-between border-t-[6px] border-ink pt-1">
                        <span className="text-[0.9375rem] font-bold">Calories</span>
                        <span className="font-mono text-[1.5rem] leading-none font-bold">
                          {round(recipe.nutrition.calories, 5)}
                        </span>
                      </div>
                    )}
                    <p className="mt-1 border-t border-ink pt-1 text-right text-[0.6875rem] font-bold">% Daily value*</p>
                    <dl>
                      {label.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-baseline justify-between gap-3 border-t border-line-strong py-1 text-[0.8125rem]"
                        >
                          <dt className={row.indent ? "pl-4" : "font-bold"}>
                            {row.label} <span className="font-normal">{row.value}</span>
                          </dt>
                          <dd className="font-mono font-bold">{row.dv != null ? `${row.dv}%` : ""}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-1.5 border-t-[6px] border-ink pt-1.5 text-[0.6875rem] leading-snug text-ink-muted">
                      *Percent daily values use a 2,000 calorie diet. Amounts are estimated from USDA data.
                    </p>
                  </div>
                </details>
              )}
            </section>
          )}

          {(recipe.diets.length > 0 || recipe.cookware.length > 0) && (
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              {recipe.diets.length > 0 && (
                <div>
                  <p className="label-mono mb-2">Diet</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {recipe.diets.map((d) => (
                      <li key={d.slug}>
                        <Chip isStatic>{d.name}</Chip>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recipe.cookware.length > 0 && (
                <section aria-labelledby="cookware-h">
                  <h2 id="cookware-h" className="label-mono mb-2">
                    Cookware
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {recipe.cookware.map((c) => (
                      <li
                        key={c}
                        className="rounded-md border border-line bg-band px-2.5 py-1.5 text-[0.8125rem]"
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Ingredients and method side by side; method gets the wider column. */}
      <div className="mt-10 grid gap-x-12 gap-y-10 border-t border-line pt-8 lg:mt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Client island: servings scaler, have/missing marks, add to shopping list. */}
        <ServingsScaler
          baseServings={recipe.servings}
          ingredients={recipe.ingredients}
          recipe={{ slug: recipe.slug, title: recipe.title }}
        />

        <section aria-labelledby="method-h">
          <h2 id="method-h" className="mb-3 text-[1.375rem]">
            Method
          </h2>
          <ol className="flex max-w-[46rem] flex-col gap-5">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-herb font-mono text-xs font-semibold text-on-herb"
                >
                  {i + 1}
                </span>
                <p className="text-base leading-relaxed text-ink-deep lg:text-[1.0625rem]">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="mt-10 border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-ink-muted">
        {isUsda && recipe.sourceUrl ? (
          <p>
            Recipe and nutrition from{" "}
            <a
              href={`https://web.archive.org/web/${recipe.sourceUrl}`}
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-herb"
            >
              USDA MyPlate Kitchen
            </a>{" "}
            (U.S. Department of Agriculture, public domain). The original site has been retired, so
            the link opens its archived copy.
          </p>
        ) : isAi ? (
          <p>
            Written by Minced with AI assistance and reviewed before publishing.{" "}
            <Link href="/about" className="underline underline-offset-2 hover:text-herb">
              How we make recipes
            </Link>
            .
          </p>
        ) : isUser ? (
          <p>
            Shared by a Minced cook and reviewed before publishing. Nutrition, where shown, is an
            estimate.{" "}
            <Link href="/about" className="underline underline-offset-2 hover:text-herb">
              How we make recipes
            </Link>
            .
          </p>
        ) : (
          <p>Original recipe by Minced.</p>
        )}
      </footer>
    </article>
  );
}

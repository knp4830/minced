import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/ui/chip";
import { MetaRow } from "@/components/ui/metaRow";
import { ServingsScaler } from "@/components/recipe/servingsScaler";
import { AI_SOURCE_NAME } from "@/lib/queries/browse";
import { getRecipeBySlug, type RecipeDetail } from "@/lib/queries/recipeDetail";
import { needsAttribution } from "@/lib/photos";

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

  return {
    title: recipe.title,
    description: `${recipe.title}: ${bits.join(", ")}. Ingredients and steps, nothing else.`,
    alternates: { canonical: `/recipes/${recipe.slug}` },
    openGraph: {
      title: recipe.title,
      type: "article",
      images: recipe.photo ? [recipe.photo.url] : recipe.imageUrl ? [recipe.imageUrl] : undefined,
    },
  };
}

const round = (n: number, step: number) => Math.round(n / step) * step;

function nutritionRows(n: RecipeDetail["nutrition"]) {
  const rows: { label: string; value: string }[] = [];
  if (n.calories != null) rows.push({ label: "Calories", value: `${round(n.calories, 5)}` });
  if (n.proteinG != null) rows.push({ label: "Protein", value: `${Math.round(n.proteinG)} g` });
  if (n.carbsG != null) rows.push({ label: "Carbs", value: `${Math.round(n.carbsG)} g` });
  if (n.fatG != null) rows.push({ label: "Fat", value: `${Math.round(n.fatG)} g` });
  if (n.fiberG != null) rows.push({ label: "Fiber", value: `${Math.round(n.fiberG)} g` });
  if (n.sodiumMg != null) rows.push({ label: "Sodium", value: `${round(n.sodiumMg, 10)} mg` });
  return rows;
}

export default async function RecipePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const photoSrc = recipe.photo?.url ?? recipe.imageUrl;
  const isUsda = recipe.sourceName?.includes("MyPlate") ?? false;
  const isAi = recipe.sourceName === AI_SOURCE_NAME;
  const nutrition = nutritionRows(recipe.nutrition);

  return (
    <article className="mx-auto max-w-[1180px] px-(--gutter) pt-4 pb-6 md:pt-6">
      <Link
        href="/recipes"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-ink-muted hover:text-herb"
      >
        <ChevronLeft aria-hidden className="size-4" />
        All recipes
      </Link>

      <header className="mt-1 mb-6">
        {recipe.cuisine && <p className="label-mono mb-2 tracking-[0.1em]">{recipe.cuisine}</p>}
        <h1 className="text-[2rem] leading-[1.05] tracking-[-0.025em] sm:text-[2.5rem]">
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

      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[17.5rem_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Photo or colour block */}
        <figure className="lg:col-start-1 lg:row-start-1">
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-line bg-hatch sm:aspect-[2/1] lg:aspect-[4/5]">
            {photoSrc ? (
              // Host varies by source (Storage / federal / Wikimedia): plain <img>.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt={recipe.photo?.altText ?? recipe.title}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <span className="absolute bottom-3 left-3 rounded-xs bg-canvas px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-subtle">
                photo · {recipe.title.toLowerCase()}
              </span>
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
          {recipe.diets.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="label-mono mr-1">diet</span>
              {recipe.diets.map((d) => (
                <Chip key={d.slug} isStatic>
                  {d.name}
                </Chip>
              ))}
            </div>
          )}
          {recipe.allergens.length > 0 && (
            <div className="mt-4 rounded-lg border border-paprika/30 bg-paprika/5 px-3.5 py-3">
              <p className="mb-1 flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.08em] text-paprika-deep uppercase">
                <span aria-hidden className="size-1.5 rounded-full bg-paprika" />
                Allergens
              </p>
              <p className="text-[0.8125rem] text-paprika-deep">
                Contains {recipe.allergens.join(", ").toLowerCase()}.
              </p>
            </div>
          )}
        </figure>

        {/* Ingredients (client island: servings scaler) */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <ServingsScaler baseServings={recipe.servings} ingredients={recipe.ingredients} />
        </div>

        {/* Method */}
        <section
          aria-labelledby="method-h"
          className="lg:col-start-3 lg:row-span-2 lg:row-start-1"
        >
          <h2 id="method-h" className="mb-3 text-[1.375rem]">
            Method
          </h2>
          <ol className="flex flex-col gap-4">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3.5">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-herb font-mono text-xs font-semibold text-on-herb"
                >
                  {i + 1}
                </span>
                <p className="text-[0.9375rem] leading-relaxed text-ink-deep">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Nutrition + cookware */}
        <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-2">
          {nutrition.length > 0 && (
            <section
              aria-labelledby="nutrition-h"
              className="rounded-xl border border-line bg-band p-4"
            >
              <h2 id="nutrition-h" className="label-mono mb-3">
                Nutrition per serving
              </h2>
              <dl className="flex flex-col gap-2">
                {nutrition.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[0.8125rem] text-ink-muted">{row.label}</dt>
                    <dd className="font-mono text-[0.8125rem] font-semibold">~{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 border-t border-line pt-2.5 font-mono text-[0.6875rem] text-ink-subtle">
                estimate · USDA data
              </p>
            </section>
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
        ) : (
          <p>Original recipe by Minced.</p>
        )}
      </footer>
    </article>
  );
}

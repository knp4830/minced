import { ArrowRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoon } from "@/components/landing/comingSoon";
import { CookFromWhatYouHave } from "@/components/landing/cookFromWhatYouHave";
import { HERO } from "@/components/landing/copy";
import { FeatureTiles } from "@/components/landing/featureTiles";
import { HeroPhotos } from "@/components/landing/heroPhotos";
import { LandingNav } from "@/components/landing/landingNav";
import { RecipeCard } from "@/components/recipe/recipeCard";
import { SelectFiltersDialog } from "@/components/recipe/selectFiltersDialog";
import { getFilterOptions, getRecipePage } from "@/lib/queries/browse";
import { parseFilters } from "@/lib/filters";
import { getIngredientCatalog } from "@/lib/queries/ingredientCatalog";
import { countFilterGroups, getHeroSlides, getLandingPhotos, getRecipeCount } from "@/lib/queries/landing";

/*
 * Landing, wave 13 (design/handoff-2026-10-22/README.md, layout 3c "photo-led"): full-bleed rotating hero
 * with the search card, the fridge band, four feature tiles, a strip of real recipe cards, what you get, why
 * we built this, and the dark coming-soon band that runs into the footer. The only warm screen in the
 * product. Static, revalidated hourly; the hero photos, Select filters and the fridge card are the client
 * islands.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Minced: recipes by name or by the ingredients you have" },
  alternates: { canonical: "/" },
};

const GET = [
  {
    title: "Cook from what you have",
    body: "Choose ingredients, or save your fridge, and see what you can make now.",
  },
  {
    title: "Every measurement, upfront",
    body: "Time, servings, calories and protein first, then exact amounts and numbered steps.",
  },
  {
    title: "Filter by what matters",
    body: "Time, diet, allergens, ingredients, calories, protein or the cookware you own.",
  },
  {
    title: "Honest sources",
    body: "Mostly USDA public domain; Minced originals are drafted with AI and labelled that way.",
    href: "/about",
    cta: "How recipes are made",
  },
] as const;

export default async function Home() {
  const [recipeCount, options, slides, photos, catalog, firstPage] = await Promise.all([
    getRecipeCount(),
    getFilterOptions(),
    getHeroSlides(),
    getLandingPhotos(),
    getIngredientCatalog(),
    getRecipePage(parseFilters({})),
  ]);
  const filterCount = countFilterGroups(options);
  const recipes = recipeCount.toLocaleString("en-US");
  const strip = firstPage.recipes.slice(0, 4);
  // Tiles take full-size curated photos (slots 3+) that the hero is not already showing; if the hero has
  // claimed too many, any curated photo fills the gap rather than leaving a tile bare.
  const notInHero = (p: { slug: string }) => !slides.some((s) => s.slug === p.slug);
  const tilePhotos = [...photos.slice(3).filter(notInHero), ...photos.slice(0, 3).filter(notInHero), ...photos.slice(3)]
    .filter((p, i, all) => all.findIndex((q) => q.slug === p.slug) === i)
    .slice(0, 3);

  return (
    <>
      <LandingNav />
      <section
        aria-labelledby="hero-h"
        className="relative isolate flex min-h-[620px] flex-col overflow-hidden bg-night pb-8 text-on-night md:min-h-[min(740px,calc(100svh-4.5rem))] md:pb-12"
      >
        <div className="mt-auto pt-16">
          <HeroPhotos slides={slides}>
            <p className="mb-4 font-mono text-[0.8125rem] tracking-[0.12em] text-on-night uppercase">{HERO.eyebrow}</p>
            <h1
              id="hero-h"
              className="max-w-[12em] text-[2.75rem] leading-none tracking-[-0.015em] text-on-night md:text-[4.25rem] xl:text-[5.25rem]"
            >
              {HERO.headline}
            </h1>
            <p className="mt-4 max-w-[34em] text-base leading-[1.5] text-on-night md:text-[1.125rem]">{HERO.sub}</p>

            <div className="mt-6 max-w-[40rem] rounded-2xl bg-surface p-2.5 text-ink shadow-float">
              <div className="flex flex-col gap-2 sm:flex-row">
                <form role="search" action="/recipes" method="get" className="min-w-0 flex-1">
                  <div className="flex min-h-12 items-center gap-2 rounded-field border border-field bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20">
                    <Search aria-hidden className="size-4 shrink-0 text-stone" />
                    <label htmlFor="hero-search" className="sr-only">
                      Search recipes
                    </label>
                    <input
                      id="hero-search"
                      name="q"
                      type="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      placeholder="Search a dish, like shakshuka"
                      className="min-h-11 w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle"
                    />
                  </div>
                </form>
                <SelectFiltersDialog catalog={catalog} options={options} variant="primary" />
              </div>
            </div>

            <p className="mt-4 font-mono text-[0.8125rem] text-on-night-muted">
              {recipes} recipes · {filterCount} filters · no sign-up to search
            </p>
          </HeroPhotos>
        </div>
      </section>

      <CookFromWhatYouHave />

      <FeatureTiles photos={tilePhotos} />

      {strip.length > 0 && (
        <section aria-labelledby="strip-h" className="page-w py-12 md:py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 md:mb-8">
            <h2 id="strip-h" className="text-[1.625rem] leading-[1.08] md:text-[2.5rem]">
              A few to start with
            </h2>
            <Link
              href="/recipes"
              className="inline-flex min-h-11 items-center gap-1 text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:text-herb"
            >
              Browse all <span className="font-mono">{recipes}</span> recipes
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {strip.map((r) => (
              <li key={r.slug} className="min-w-0">
                <RecipeCard {...r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="get-h" className="border-y border-line bg-band">
        <div className="page-w py-12 md:py-16">
          <h2 id="get-h" className="label-mono mb-6 text-herb md:mb-8">
            What you actually get
          </h2>
          <ul className="grid gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-10">
            {GET.map((f) => (
              <li key={f.title}>
                <h3 className="mb-2 text-[1.4375rem] leading-tight">{f.title}</h3>
                <p className="text-[0.9375rem] leading-normal text-ink-muted">{f.body}</p>
                {"href" in f && (
                  <Link
                    href={f.href}
                    className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-4 hover:text-herb"
                  >
                    {f.cta}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="why-h" className="px-(--gutter) py-14 md:py-24">
        <div className="mx-auto max-w-[900px]">
          <h2 id="why-h" className="label-mono mb-5 text-herb">
            Why we built this
          </h2>
          <p className="font-display text-[1.375rem] leading-[1.35] text-ink-deep md:text-[1.875rem]">
            We love cooking, and we love a good recipe story. We also know the days when you have twenty minutes,
            a half-full fridge and somewhere to be.
          </p>
          <div className="mt-6 grid gap-4 text-base leading-[1.6] text-ink-muted md:grid-cols-2 md:gap-10">
            <p>
              Stories are lovely when there’s time to read them. For the times when there isn’t, Minced puts the
              decision first: time, servings, calories and protein at the top, then the exact things you’ll buy and
              the steps in order.
            </p>
            <p>
              It’s for people short on time, people who train, and anyone trying to eat a bit better. Find a dish by
              name or by what you already have, and get cooking.
            </p>
          </div>
        </div>
      </section>

      <ComingSoon />
    </>
  );
}

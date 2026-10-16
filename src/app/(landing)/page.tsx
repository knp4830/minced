import { ArrowRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoon } from "@/components/landing/comingSoon";
import { HERO } from "@/components/landing/copy";
import { LandingCta } from "@/components/landing/landingCta";
import { PhotoMosaic } from "@/components/landing/photoMosaic";
import { FridgePicker } from "@/components/pantry/fridgePicker";
import { Button } from "@/components/ui/button";
import { getFilterOptions } from "@/lib/queries/browse";
import { getIngredientCatalog } from "@/lib/queries/ingredientCatalog";
import { countFilterGroups, getLandingPhotos, getRecipeCount } from "@/lib/queries/landing";

/*
 * Landing, per design/HANDOFF.md section 1: hero, features band, "why", coming soon,
 * CTA band. The only warm screen in the product. Static, revalidated hourly; the
 * pantry input is the one client island and hydrates its saved pantry itself.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Minced: recipes by name or by what's in your fridge" },
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    title: "Cook from what you have",
    body: "Tap what’s in your fridge. Minced shows every recipe that uses it, closest match first, and never counts salt, oil or water.",
    radius: "50%",
  },
  {
    title: "Every measurement, upfront",
    body: "Time, servings, calories and protein sit at the top. Then exact ingredient amounts and numbered steps, so you know what you’re in for before you start.",
    radius: "3px",
  },
  {
    title: "Filter by what matters",
    body: "Narrow by time, diet, allergens, ingredients, calories, protein or the cookware you own. Filters live in the link, so you can share them.",
    radius: "50% 50% 3px 3px",
  },
  {
    title: "Honest sources",
    body: "Most recipes are USDA public domain. The rest are Minced originals drafted with AI, and labelled that way.",
    radius: "3px 50% 3px 50%",
    href: "/about",
    cta: "How recipes are made",
  },
] as const;

export default async function Home() {
  const [recipeCount, options, photos, catalog] = await Promise.all([
    getRecipeCount(),
    getFilterOptions(),
    getLandingPhotos(),
    getIngredientCatalog(),
  ]);
  const filterCount = countFilterGroups(options);
  const recipes = recipeCount.toLocaleString("en-US");
  const collage = photos.slice(6, 9);

  return (
    <>
      <div className="bg-[radial-gradient(60rem_32rem_at_85%_-10%,color-mix(in_oklab,var(--color-saffron)_16%,transparent),transparent_70%),radial-gradient(48rem_30rem_at_0%_100%,color-mix(in_oklab,var(--color-herb)_9%,transparent),transparent_70%)]">
        <section
          aria-labelledby="hero-h"
          className="grid page-w items-center gap-8 pt-8 pb-10 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pt-16 md:pb-14 xl:gap-20 xl:pt-24 xl:pb-20"
        >
          <div className="min-w-0">
            <p className="mb-4 font-mono text-[0.6875rem] tracking-[0.14em] text-herb uppercase md:mb-5">
              {HERO.eyebrow}
            </p>
            <h1
              id="hero-h"
              className="text-[2.375rem] leading-[1.02] tracking-[-0.025em] sm:text-[2.75rem] lg:text-[3.5rem] xl:text-[4.25rem]"
            >
              {HERO.headline}
            </h1>
            <p className="mt-4 max-w-[32em] text-base leading-[1.55] text-ink-soft md:mt-5 md:text-[1.0625rem] xl:text-[1.1875rem]">
              {HERO.sub}
            </p>

            <div className="mt-6 max-w-[32rem] md:mt-7 xl:max-w-[36rem]">
              <form role="search" action="/recipes" method="get" className="flex gap-2">
                <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-field border border-field bg-surface px-3.5 shadow-lift transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20">
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
                    placeholder="Search recipes"
                    className="min-h-11 w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle"
                  />
                </div>
                <Button type="submit" size="lg">
                  Search
                </Button>
              </form>

              <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <FridgePicker variant="hero" catalog={catalog} />
                <Link
                  href="/recipes"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink underline underline-offset-4 hover:text-herb"
                >
                  Browse all <span className="font-mono">{recipes}</span> recipes
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            </div>

            <dl className="mt-6 grid max-w-[32rem] grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface/70 text-center xl:max-w-[36rem]">
              {[
                [recipes, "recipes"],
                [String(filterCount), "filters"],
                ["No sign-up", "to search"],
              ].map(([n, label]) => (
                <div key={label} className="px-2 py-3">
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-display text-xl leading-none whitespace-nowrap font-semibold text-ink md:text-2xl">
                    {n}
                    <span aria-hidden className="mt-1 block font-mono text-[0.6875rem] font-normal tracking-normal text-ink-subtle">
                      {label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <PhotoMosaic photos={photos} />
        </section>
      </div>

      <section aria-labelledby="features-h" className="border-y border-line bg-band">
        <div className="page-w py-12 md:py-16">
          <h2 id="features-h" className="label-mono mb-6 md:mb-8">
            What you actually get
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-4 md:gap-[22px]">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="flex flex-col rounded-xl border border-line border-t-[3px] border-t-herb bg-surface p-6 shadow-lift transition-transform duration-200 ease-out hover:-translate-y-0.5"
              >
                <div className="mb-5 flex items-center justify-between">
                  <div
                    aria-hidden
                    className="flex size-[38px] items-center justify-center rounded-[10px] bg-herb"
                  >
                    <span
                      className="size-4 border-[2.5px] border-saffron"
                      style={{ borderRadius: f.radius }}
                    />
                  </div>
                  <span aria-hidden className="font-mono text-xs text-ink-subtle">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mb-2 text-xl tracking-[-0.01em]">{f.title}</h3>
                <p className="text-sm leading-normal text-ink-muted">{f.body}</p>
                {"href" in f && (
                  <Link
                    href={f.href}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4 hover:text-herb"
                  >
                    {f.cta}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="why-h" className="bg-surface px-(--gutter) py-14 md:py-20">
        <div className="mx-auto grid max-w-[var(--page-max)] items-center gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          {collage.length === 3 && (
            <ul aria-hidden className="grid aspect-[5/4] grid-cols-5 grid-rows-2 gap-2 sm:gap-3">
              {collage.map((p, i) => (
                <li
                  key={p.slug}
                  className={
                    i === 0
                      ? "col-span-3 row-span-2"
                      : "col-span-2"
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    width={400}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    className="size-full rounded-xl border border-line object-cover shadow-frame"
                  />
                </li>
              ))}
            </ul>
          )}
          <div className={collage.length === 3 ? "" : "mx-auto max-w-[720px] text-center md:col-span-2"}>
            <h2
              id="why-h"
              className="mb-5 font-mono text-[0.6875rem] font-normal tracking-[0.12em] text-herb uppercase"
            >
              Why we built this
            </h2>
            <p className="mb-5 font-display text-[1.375rem] leading-[1.4] font-normal tracking-[-0.01em] text-ink-deep md:text-[1.75rem]">
              We love cooking, and we love a good recipe story. We also know the nights
              when you have twenty minutes, a half-full fridge and somewhere to be.
            </p>
            <p className="mb-4 text-base leading-[1.6] text-ink-muted">
              Stories are lovely when there’s time to read them. For the evenings when
              there isn’t, Minced puts the decision first: time, servings, calories
              and protein at the top, then the exact things you’ll buy and the steps
              in order.
            </p>
            <p className="text-base leading-[1.6] text-ink-muted">
              It’s for people short on time, people who train, and anyone trying to eat a
              bit better. Find a dish by name or by what you already have, and get
              cooking. The warmth stays on this page, and the speed is in everything past
              it.
            </p>
          </div>
        </div>
      </section>

      <ComingSoon />

      <section
        aria-labelledby="cta-h"
        className="on-herb bg-[linear-gradient(180deg,var(--color-herb),var(--color-herb-deep))] px-(--gutter) py-14 text-center text-on-herb md:py-16"
      >
        <span aria-hidden className="mx-auto mb-5 block h-1 w-12 rounded-full bg-saffron" />
        <h2 id="cta-h" className="mb-6 text-[1.875rem] md:text-[2.125rem]">
          Ready when you are.
        </h2>
        <LandingCta />
      </section>
    </>
  );
}

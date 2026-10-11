import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PantryInput } from "@/components/pantry/pantryInput";
import { Button } from "@/components/ui/button";
import { getFilterOptions } from "@/lib/queries/browse";
import {
  countFilterGroups,
  getLandingPhotos,
  getRecipeCount,
  type LandingPhoto,
} from "@/lib/queries/landing";

/*
 * Landing, per design/HANDOFF.md section 1: hero, features band, "why", CTA band.
 * The only warm screen in the product. Static, revalidated hourly; the pantry
 * input is the one client island and hydrates its saved pantry itself.
 */
export const revalidate = 3600;

const FEATURES = [
  {
    title: "Cook from what you have",
    body: "Add what’s in your kitchen. Minced ranks recipes by how little you’re missing, and never counts salt, oil or water.",
    radius: "50%",
  },
  {
    title: "Read the spec, not a story",
    body: "Time, servings, calories and spice sit at the top. Then ingredients and numbered steps. Nothing else.",
    radius: "3px",
  },
  {
    title: "Filter by what matters",
    body: "Narrow by time, diet, allergens, spice, calories or protein. Filters live in the link, so you can share them.",
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

function PhotoGrid({ photos }: { photos: LandingPhoto[] }) {
  const tiles = Array.from({ length: 9 }, (_, i) => photos[i] ?? null);
  return (
    <div>
      <ul aria-label="Some of the recipes" className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((p, i) =>
          p ? (
            <li key={p.slug}>
              <Link
                href={`/recipes/${p.slug}`}
                className="group relative block aspect-square overflow-hidden rounded-xl border border-line bg-hatch"
              >
                {/* Remote Storage host, already thumbnailed: no next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.alt}
                  width={400}
                  height={400}
                  loading={i < 3 ? "eager" : "lazy"}
                  decoding="async"
                  className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />
              </Link>
            </li>
          ) : (
            <li key={`empty-${i}`} aria-hidden>
              <div className="flex aspect-square items-end rounded-xl border border-line bg-hatch p-2">
                <span className="rounded-xs bg-canvas px-1.5 py-0.5 font-mono text-[0.5625rem] text-ink-subtle">
                  photo
                </span>
              </div>
            </li>
          ),
        )}
      </ul>
      <p className="mt-3 text-right font-mono text-[0.6875rem] text-ink-subtle">
        <Link
          href="/about#photos"
          className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-herb"
        >
          Photo credits
        </Link>
      </p>
    </div>
  );
}

export default async function Home() {
  const [recipeCount, options, photos] = await Promise.all([
    getRecipeCount(),
    getFilterOptions(),
    getLandingPhotos(),
  ]);
  const filterCount = countFilterGroups(options);
  const recipes = recipeCount.toLocaleString("en-US");

  return (
    <>
      <section
        aria-labelledby="hero-h"
        className="mx-auto grid max-w-[1180px] items-center gap-8 px-(--gutter) pt-8 pb-10 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pt-16 md:pb-14"
      >
        <div className="min-w-0">
          <p className="mb-4 font-mono text-[0.6875rem] tracking-[0.14em] text-herb uppercase md:mb-5">
            Recipe search, measured &amp; fast
          </p>
          <h1
            id="hero-h"
            className="text-[2.375rem] leading-[1.02] tracking-[-0.025em] sm:text-[2.75rem] lg:text-[3.5rem]"
          >
            Find the recipe. Skip the life story.
          </h1>
          <p className="mt-4 max-w-[30em] text-base leading-[1.55] text-ink-soft md:mt-5 md:text-[1.0625rem]">
            Tell Minced what’s in your kitchen and it ranks recipes by how little you’re
            missing. Ingredients, amounts, numbered steps.
          </p>

          <div className="mt-6 max-w-[32rem] md:mt-7">
            <p className="label-mono mb-2.5">What’s in your kitchen?</p>
            <PantryInput variant="hero" />
            <p className="mt-3 text-sm text-ink-muted">
              or{" "}
              <Link
                href="/recipes"
                className="inline-flex min-h-11 items-center gap-1 font-medium text-ink underline underline-offset-4 hover:text-herb"
              >
                Browse all <span className="font-mono">{recipes}</span> recipes
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </p>
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-ink-subtle">
            <span>{recipes} recipes</span>
            <span aria-hidden className="text-stone-line">·</span>
            <span>{filterCount} filters</span>
            <span aria-hidden className="text-stone-line">·</span>
            <span>0 backstories</span>
          </p>
        </div>

        <PhotoGrid photos={photos} />
      </section>

      <section aria-labelledby="features-h" className="border-t border-line bg-band">
        <div className="mx-auto max-w-[1180px] px-(--gutter) py-12 md:py-14">
          <h2 id="features-h" className="label-mono mb-6 md:mb-7">
            What you actually get
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-4 md:gap-[22px]">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="flex flex-col rounded-xl border border-line bg-panel p-6"
              >
                <div
                  aria-hidden
                  className="mb-4 flex size-[34px] items-center justify-center rounded-[9px] bg-herb"
                >
                  <span
                    className="size-3.5 border-[2.5px] border-saffron"
                    style={{ borderRadius: f.radius }}
                  />
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

      <section aria-labelledby="why-h" className="px-(--gutter) py-14 md:py-16">
        <div className="mx-auto max-w-[720px] text-center">
          <h2
            id="why-h"
            className="mb-5 font-mono text-[0.6875rem] font-normal tracking-[0.12em] text-herb uppercase"
          >
            Why we built this
          </h2>
          <p className="mb-5 font-display text-[1.375rem] leading-[1.4] font-normal tracking-[-0.01em] text-ink-deep md:text-[1.625rem]">
            We love cooking. We do not love scrolling past a thousand words about
            someone’s grandmother to reach a list of six ingredients.
          </p>
          <p className="text-base leading-[1.6] text-ink-muted">
            Minced treats a recipe like what it is: a spec. Time, servings, calories and
            spice at the top, then the exact things you’ll buy. The warmth stays on this
            page. Everything past it is built to get you cooking faster.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="cta-h"
        className="on-herb bg-herb px-(--gutter) py-12 text-center text-on-herb"
      >
        <h2 id="cta-h" className="mb-6 text-[1.875rem] md:text-[2.125rem]">
          Ready when you are.
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="inverse" size="lg">
            <Link href="/pantry">What can I make?</Link>
          </Button>
          <Button asChild variant="inverse-outline" size="lg">
            <Link href="/recipes">Browse recipes</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

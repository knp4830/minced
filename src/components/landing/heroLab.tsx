import { Search } from "lucide-react";
import Link from "next/link";
import { useId, type CSSProperties } from "react";
import { HERO } from "@/components/landing/copy";
import { PhotoMosaic } from "@/components/landing/photoMosaic";
import { Button } from "@/components/ui/button";
import type { LandingPhoto } from "@/lib/queries/landing";
import { cn } from "@/lib/utils";

/*
 * /lab/hero: five hero options, one per font pairing and layout, for the owner to
 * choose from. Not linked, not in the sitemap, noindex. Each option re-points the
 * --font-display / --font-sans tokens on its own wrapper, so every utility inside
 * (font-display, h1 base rule, body) follows without touching the live site.
 * The search form is plain HTML here; the live hero adds the fridge picker.
 */
export type LabVariant = {
  id: "A" | "B" | "C" | "D" | "E";
  name: string;
  pairing: string;
  rationale: string;
  cost: string;
  layout: string;
  /** next/font variable class names for this variant's fonts. */
  fontClass: string;
  display: string;
  sans: string;
};

function SearchRow({ onDark = false }: { onDark?: boolean }) {
  const id = useId();
  return (
    <form role="search" action="/recipes" method="get" className="flex gap-2">
      <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-field border border-field bg-surface px-3.5 shadow-lift">
        <Search aria-hidden className="size-4 shrink-0 text-stone" />
        <label className="sr-only" htmlFor={id}>
          Search recipes
        </label>
        <input
          id={id}
          name="q"
          type="search"
          autoComplete="off"
          placeholder="Search recipes"
          className="min-h-11 w-full min-w-0 bg-transparent py-2 text-base text-ink outline-none placeholder:text-ink-subtle"
        />
      </div>
      <Button type="submit" size="lg" variant={onDark ? "inverse" : "primary"}>
        Search
      </Button>
    </form>
  );
}

const CHIPS = [
  ["Under 30 min", "/recipes?maxTime=30"],
  ["High protein", "/recipes?proteinMin=30"],
  ["Vegetarian", "/recipes?diet=vegetarian"],
] as const;

function Chips({ onDark = false }: { onDark?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {CHIPS.map(([label, href]) => (
        <li key={href}>
          <Link
            href={href}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
              onDark
                ? "border-on-herb/35 text-on-herb hover:border-saffron hover:text-saffron"
                : "border-outline bg-surface text-ink hover:border-herb hover:text-herb",
            )}
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mb-4 font-mono text-[0.6875rem] tracking-[0.14em] uppercase", className ?? "text-herb")}>
      {children}
    </p>
  );
}

function Thumb({ p, className }: { p?: LandingPhoto; className?: string }) {
  if (!p) return <div className={cn("rounded-xl border border-line bg-hatch", className)} />;
  return (
    <Link
      href={`/recipes/${p.slug}`}
      className={cn("relative block overflow-hidden rounded-xl border border-line bg-hatch shadow-lift", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.url} alt={p.alt} width={400} height={400} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
    </Link>
  );
}

/** A: split with a mosaic. The live layout, current fonts. */
function LayoutA({ photos }: { photos: LandingPhoto[] }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12">
      <div>
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        <h3 className="text-[2.375rem] leading-[1.02] tracking-[-0.025em] lg:text-[3.25rem]">{HERO.headline}</h3>
        <p className="mt-4 max-w-[32em] leading-[1.55] text-ink-soft">{HERO.sub}</p>
        <div className="mt-6 max-w-[32rem]">
          <SearchRow />
        </div>
      </div>
      <PhotoMosaic photos={photos} />
    </div>
  );
}

/** B: centered, search first, photo strip underneath. */
function LayoutB({ photos }: { photos: LandingPhoto[] }) {
  return (
    <div className="text-center">
      <div className="mx-auto max-w-[44rem]">
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        <h3 className="text-[2.5rem] leading-[1.02] tracking-[-0.025em] lg:text-[4rem]">{HERO.headline}</h3>
        <p className="mx-auto mt-4 max-w-[36em] leading-[1.55] text-ink-soft">{HERO.sub}</p>
        <div className="mx-auto mt-6 max-w-[36rem] text-left">
          <SearchRow />
        </div>
        <div className="mt-4 flex justify-center">
          <Chips />
        </div>
      </div>
      <ul className="mt-10 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className={i > 2 ? "hidden md:block" : ""}>
            <Thumb p={photos[i]} className="aspect-[4/5] w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** C: full-bleed bay green, light text, two stacked photos. */
function LayoutC({ photos }: { photos: LandingPhoto[] }) {
  return (
    <div className="on-herb -mx-(--gutter) rounded-xl bg-herb px-(--gutter) py-10 text-on-herb md:mx-0 md:px-12 md:py-14">
      <div className="grid items-center gap-8 md:grid-cols-[1.2fr_0.8fr] md:gap-12">
        <div>
          <Eyebrow className="text-saffron">{HERO.eyebrow}</Eyebrow>
          <h3 className="text-[2.375rem] leading-[1.02] tracking-[-0.025em] text-on-herb lg:text-[3.5rem]">{HERO.headline}</h3>
          <p className="mt-4 max-w-[32em] leading-[1.55] text-on-herb/85">{HERO.sub}</p>
          <div className="mt-6 max-w-[32rem]">
            <SearchRow onDark />
          </div>
          <div className="mt-4">
            <Chips onDark />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Thumb p={photos[0]} className="col-span-2 aspect-[16/10]" />
          <Thumb p={photos[1]} className="aspect-square" />
          <Thumb p={photos[2]} className="aspect-square" />
        </div>
      </div>
    </div>
  );
}

/** D: photo-led, the text sits on a card that overlaps one big picture. */
function LayoutD({ photos }: { photos: LandingPhoto[] }) {
  return (
    <div className="relative">
      <Thumb p={photos[0]} className="aspect-[16/10] w-full md:aspect-[21/9] md:min-h-[26rem]" />
      <div className="relative -mt-12 mr-4 ml-4 rounded-xl border border-line bg-surface p-6 shadow-frame md:absolute md:top-1/2 md:left-8 md:mt-0 md:mr-0 md:ml-0 md:max-w-[34rem] md:-translate-y-1/2 md:p-9">
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        <h3 className="text-[2.125rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">{HERO.headline}</h3>
        <p className="mt-3 text-[0.9375rem] leading-[1.55] text-ink-soft">{HERO.sub}</p>
        <div className="mt-5">
          <SearchRow />
        </div>
      </div>
    </div>
  );
}

/** E: app-first. A tight search block with quick filters and a row of tiles. */
function LayoutE({ photos }: { photos: LandingPhoto[] }) {
  return (
    <div className="grid items-start gap-8 md:grid-cols-[1fr_1fr]">
      <div>
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        <h3 className="text-[2.25rem] leading-[1.05] tracking-[-0.03em] lg:text-[3.5rem]">{HERO.headline}</h3>
        <p className="mt-4 max-w-[30em] leading-[1.55] text-ink-soft">{HERO.sub}</p>
        <div className="mt-6 max-w-[32rem]">
          <SearchRow />
        </div>
        <div className="mt-4">
          <Chips />
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <Thumb p={photos[i]} className="aspect-[4/3] w-full" />
            <p className="mt-1.5 truncate font-mono text-[0.6875rem] text-ink-subtle">{photos[i]?.title ?? ""}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LAYOUTS = { A: LayoutA, B: LayoutB, C: LayoutC, D: LayoutD, E: LayoutE } as const;

export function HeroOption({ v, photos }: { v: LabVariant; photos: LandingPhoto[] }) {
  const Layout = LAYOUTS[v.id];
  const style = { "--font-display": v.display, "--font-sans": v.sans, fontFamily: v.sans } as CSSProperties;
  return (
    <section aria-labelledby={`opt-${v.id}`} className="border-t border-line py-10 md:py-14">
      <div className="page-w">
        <header className="mb-6 max-w-[48rem]">
          <h2 id={`opt-${v.id}`} className="mb-2 text-xl">
            Option {v.id}: {v.name}
          </h2>
          <dl className="grid gap-x-4 gap-y-1 text-sm text-ink-muted sm:grid-cols-[7rem_1fr]">
            <dt className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-subtle uppercase">Fonts</dt>
            <dd>{v.pairing}</dd>
            <dt className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-subtle uppercase">Layout</dt>
            <dd>{v.layout}</dd>
            <dt className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-subtle uppercase">Why</dt>
            <dd>{v.rationale}</dd>
            <dt className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-subtle uppercase">Weight</dt>
            <dd>{v.cost}</dd>
          </dl>
        </header>
        <div className={cn(v.fontClass, "rounded-xl bg-canvas")} style={style}>
          <div className="rounded-xl border border-line bg-canvas p-4 md:p-8">
            <Layout photos={photos} />
          </div>
        </div>
      </div>
    </section>
  );
}

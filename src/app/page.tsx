import { Search } from "lucide-react";
import Link from "next/link";
import { PantryInput } from "@/components/pantry/pantryInput";
import { Button } from "@/components/ui/button";

/*
 * Landing: two doors, side by side from md up, stacked on phones with the
 * pantry first. Neither is a toggle and neither hides behind the other.
 * Static page: the pantry input hydrates its saved pantry from localStorage.
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-[1180px] px-(--gutter) py-8 md:py-16">
      <h1 className="max-w-[16ch] text-[2.25rem] leading-[1.02] tracking-[-0.025em] md:text-[3.5rem]">
        What&apos;s in your kitchen?
      </h1>
      <p className="mt-3 max-w-[32em] text-base leading-relaxed text-ink-soft md:mt-5 md:text-[1.0625rem]">
        Minced ranks recipes by how little you&apos;re missing. Ingredients,
        amounts, numbered steps. No essay.
      </p>

      <div className="mt-6 grid gap-4 md:mt-10 md:grid-cols-[1.5fr_1fr] md:gap-6">
        <section
          aria-labelledby="door-pantry"
          className="rounded-xl border border-line bg-panel p-4 sm:p-6"
        >
          <h2 id="door-pantry" className="label-mono mb-3">
            I have
          </h2>
          <PantryInput variant="landing" />
          <p className="mt-4 text-[0.8125rem] leading-snug text-ink-muted">
            Salt, pepper, oil, butter, sugar, flour and water are assumed.
          </p>
        </section>

        <section
          aria-labelledby="door-search"
          className="rounded-xl border border-line bg-panel p-4 sm:p-6"
        >
          <h2 id="door-search" className="label-mono mb-3">
            I know what I want
          </h2>
          <form role="search" action="/recipes" method="get">
            <label htmlFor="landing-q" className="sr-only">
              Search recipes
            </label>
            <div className="flex min-h-12 items-center gap-2 rounded-field border border-field bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20">
              <Search aria-hidden className="size-4 shrink-0 text-stone" />
              <input
                id="landing-q"
                name="q"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Cacio e pepe, shakshuka…"
                className="min-h-11 w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle"
              />
            </div>
            <Button type="submit" size="lg" variant="secondary" className="mt-4 w-full">
              Search recipes
            </Button>
          </form>
          <p className="mt-4 text-[0.8125rem] leading-snug text-ink-muted">
            or{" "}
            <Link
              href="/recipes"
              className="font-medium text-ink underline underline-offset-4 hover:text-herb"
            >
              browse everything
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

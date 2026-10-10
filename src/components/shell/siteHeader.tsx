import { CookingPot, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";

/*
 * Server component, no JS: search is a plain GET form, nav items are links.
 * Phones get two rows (brand + actions, then a full-width search) because the
 * search box is one of the product's two front doors and should never hide
 * behind a menu button.
 */
export function SiteHeader() {
  return (
    <header className="z-40 md:sticky md:top-0 border-b border-line bg-canvas/95 backdrop-blur-sm supports-[backdrop-filter]:bg-canvas/85">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2.5 px-(--gutter) py-3 md:flex-nowrap md:py-3.5">
        <Wordmark />

        <form
          role="search"
          action="/recipes"
          method="get"
          className="order-last flex min-h-11 w-full items-center gap-2 rounded-field border border-line bg-sunken px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20 md:order-none md:max-w-[26rem] md:flex-1"
        >
          <Search aria-hidden className="size-4 shrink-0 text-stone" />
          <label htmlFor="site-search" className="sr-only">
            Search recipes or ingredients
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search recipes or ingredients"
            className="w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle sm:text-sm"
          />
        </form>

        <nav
          aria-label="Primary"
          className="ml-auto flex items-center gap-1.5 sm:gap-3"
        >
          {/* Shopping list and Log in / Sign up return with accounts (wave 3). */}
          <Link
            href="/recipes"
            className="inline-flex min-h-11 items-center rounded-md px-2.5 text-[0.84375rem] font-medium text-ink transition-colors hover:text-herb"
          >
            Recipes
          </Link>
          <Button asChild size="sm">
            <Link href="/pantry">
              <CookingPot aria-hidden className="size-4" />
              <span>What can I make?</span>
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

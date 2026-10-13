import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { HeaderAccount } from "@/components/account/headerAccount";
import { FridgeNavButton } from "@/components/shell/fridgeNavButton";
import { HeaderSearch } from "@/components/shell/headerSearch";
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

        <HeaderSearch />

        <nav
          aria-label="Primary"
          className="ml-auto flex items-center gap-1.5 sm:gap-3"
        >
          <Link
            href="/recipes"
            className="inline-flex min-h-11 items-center rounded-md px-2.5 text-[0.84375rem] font-medium text-ink transition-colors hover:text-herb"
          >
            Recipes
          </Link>
          <Link
            href="/shopping"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-[0.84375rem] font-medium text-ink transition-colors hover:text-herb"
          >
            <ShoppingBasket aria-hidden className="size-[1.125rem] sm:hidden" />
            <span className="sr-only sm:not-sr-only">Shopping list</span>
          </Link>
          <FridgeNavButton />
          <HeaderAccount />
        </nav>
      </div>
    </header>
  );
}

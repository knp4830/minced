import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { HeaderAccount } from "@/components/account/headerAccount";

/*
 * Landing nav, per the handoff: logo (the owner dropped the "mise en place"
 * eyebrow), a text link to browse, then the auth control. There is deliberately no
 * "What's in my fridge?" button here: the hero puts it right under the search
 * box, and a second copy in the nav stacked two identical actions within one
 * screen on phones. On phones the text link drops away so the auth control fits.
 */
export function LandingNav() {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="flex page-w items-center gap-4 py-3 md:py-4">
        <Link
          href="/"
          aria-label="Minced, home"
          className="flex min-h-11 items-center gap-2.5 rounded-md"
        >
          <span className="font-display text-[1.375rem] leading-none font-semibold tracking-[-0.02em] text-ink">
            Minced
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-2 sm:gap-5">
          <Link
            href="/recipes"
            className="hidden min-h-11 items-center rounded-md text-sm font-medium text-ink transition-colors hover:text-herb sm:inline-flex"
          >
            Browse recipes
          </Link>
          <Link
            href="/shopping"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink transition-colors hover:text-herb"
          >
            <ShoppingBasket aria-hidden className="size-[1.125rem] sm:hidden" />
            <span className="sr-only sm:not-sr-only">Shopping list</span>
          </Link>
          <HeaderAccount />
        </nav>
      </div>
    </header>
  );
}

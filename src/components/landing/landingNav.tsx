import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { HeaderAccount } from "@/components/account/headerAccount";

/*
 * Landing nav, per the handoff: logo, a text link to browse, then the auth control.
 * Bay green with light text, so it reads as one piece with the closing CTA band.
 * `on-herb` flips the focus ring to saffron (green-on-green would be invisible).
 * There is deliberately no "What's in my fridge?" button here: the hero puts it right
 * under the search box, and a second copy stacked two identical actions within one
 * screen on phones. On phones the text link drops away so the auth control fits.
 *
 * HeaderAccount draws ink text and a herb avatar; both vanish on green, so its
 * colours are overridden through className rather than forking the component.
 */
const link = "rounded-md text-sm font-medium text-on-herb transition-colors hover:text-saffron";

export function LandingNav() {
  return (
    <header className="on-herb border-b border-herb-deep bg-herb text-on-herb">
      <div className="flex page-w items-center gap-4 py-3 md:py-4">
        <Link
          href="/"
          aria-label="Minced, home"
          className="flex min-h-11 items-center gap-2.5 rounded-md"
        >
          <span className="font-display text-[1.375rem] leading-none font-semibold tracking-[-0.02em] text-on-herb">
            Minced
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-2 sm:gap-5">
          <Link href="/recipes" className={`hidden min-h-11 items-center sm:inline-flex ${link}`}>
            Browse recipes
          </Link>
          <Link
            href="/shopping"
            className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 ${link}`}
          >
            <ShoppingBasket aria-hidden className="size-[1.125rem] sm:hidden" />
            <span className="sr-only sm:not-sr-only">Shopping list</span>
          </Link>
          <HeaderAccount className="text-on-herb hover:text-saffron [&>span.rounded-full]:bg-on-herb [&>span.rounded-full]:text-herb group-hover:[&>span.rounded-full]:bg-saffron" />
        </nav>
      </div>
    </header>
  );
}

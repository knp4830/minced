import { CookingPot } from "lucide-react";
import Link from "next/link";
import { HeaderAccount } from "@/components/account/headerAccount";
import { Button } from "@/components/ui/button";

/*
 * Landing nav, per the handoff: logo with the mono "mise en place" eyebrow,
 * a text link to browse, one primary action, then the auth control. On phones the eyebrow and the text link drop away so the button fits.
 */
export function LandingNav() {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-(--gutter) py-3 md:py-4">
        <Link
          href="/"
          aria-label="Minced, home"
          className="flex min-h-11 items-center gap-2.5 rounded-md"
        >
          <span className="font-display text-[1.375rem] leading-none font-semibold tracking-[-0.02em] text-ink">
            Minced
          </span>
          <span aria-hidden className="label-mono hidden sm:inline">
            mise en place
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-2 sm:gap-5">
          <Link
            href="/recipes"
            className="hidden min-h-11 items-center rounded-md text-sm font-medium text-ink transition-colors hover:text-herb sm:inline-flex"
          >
            Browse recipes
          </Link>
          <Button asChild size="sm">
            <Link href="/pantry">
              <CookingPot aria-hidden className="size-4" />
              <span>What’s in my fridge?</span>
            </Link>
          </Button>
          <HeaderAccount />
        </nav>
      </div>
    </header>
  );
}

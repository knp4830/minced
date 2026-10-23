import Link from "next/link";
import { HeaderAccount } from "@/components/account/headerAccount";

/*
 * Landing nav, sitting on the hero photo (wave 13, layout 3c): logo, "Recipes", "Fridge", then the auth
 * control. Light text over the photo's darkened top; `on-herb` flips the focus ring to saffron so it stays
 * visible on a dark picture. HeaderAccount draws ink text and a herb avatar, both lost on a photo, so the
 * text colour comes through className and the avatar through tone="onHerb".
 */
const link =
  "inline-flex min-h-11 items-center rounded-md px-1 text-[0.9375rem] font-semibold text-on-night transition-colors hover:text-saffron";

export function LandingNav() {
  return (
    <header className="on-herb relative z-10 text-on-night">
      <div className="flex page-w items-center gap-4 py-3 md:py-5">
        <Link href="/" aria-label="Minced, home" className="flex min-h-11 items-center rounded-md">
          <span className="font-display text-[1.5rem] leading-none tracking-[-0.01em] text-on-night">Minced</span>
        </Link>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-2 sm:gap-5">
          <Link href="/recipes" className={link}>
            Recipes
          </Link>
          <Link href="/fridge" className={link}>
            Fridge
          </Link>
          <HeaderAccount
            tone="onHerb"
            className="text-on-night hover:text-saffron"
            loginClassName="rounded-full border border-on-night-muted px-4 text-[0.9375rem] font-semibold hover:border-saffron"
          />
        </nav>
      </div>
    </header>
  );
}

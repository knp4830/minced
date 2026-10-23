import Link from "next/link";
import { HeaderAccount } from "@/components/account/headerAccount";

/*
 * Landing nav: a solid herb-green bar above the hero photo (the owner asked for the colour back in wave 13;
 * see-through over a photo lost the nav). Logo, "Recipes", "Fridge", then the auth control. `on-herb` flips
 * the focus ring to saffron (green-on-green would be invisible). HeaderAccount draws ink text and a herb
 * avatar, both lost on green, so the text colour comes through className and the avatar through tone="onHerb".
 */
const link =
  "inline-flex min-h-11 items-center rounded-md px-1 text-[0.9375rem] font-semibold text-on-herb transition-colors hover:text-saffron";

export function LandingNav() {
  return (
    <header className="on-herb border-b border-herb-deep bg-herb text-on-herb">
      <div className="flex page-w items-center gap-4 py-3 md:py-5">
        <Link href="/" aria-label="Minced, home" className="flex min-h-11 items-center rounded-md">
          <span className="font-display text-[1.5rem] leading-none tracking-[-0.01em] text-on-herb">Minced</span>
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
            className="text-on-herb hover:text-saffron"
            loginClassName="rounded-full border border-on-herb/60 px-4 text-[0.9375rem] font-semibold hover:border-saffron"
          />
        </nav>
      </div>
    </header>
  );
}

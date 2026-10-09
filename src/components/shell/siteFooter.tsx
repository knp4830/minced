import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";

const links = [
  { href: "/recipes", label: "Recipes" },
  { href: "/shopping", label: "Shopping list" },
  { href: "/login", label: "Log in" },
] as const;

const legal = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

const linkClass =
  "inline-flex min-h-11 items-center rounded-md text-sm text-ink-muted underline-offset-4 transition-colors hover:text-herb hover:underline";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-band">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-(--gutter) py-10 md:grid-cols-[1fr_auto] md:items-start">
        <div className="max-w-md">
          <Wordmark />
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            What to cook with what you have. Ingredients, amounts, numbered
            steps — nothing else.
          </p>
        </div>

        <nav aria-label="Footer" className="grid gap-x-12 gap-y-0 sm:grid-cols-2">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col">
            {legal.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <p className="mx-auto max-w-[1400px] px-(--gutter) py-4 font-mono text-[0.6875rem] leading-relaxed text-ink-subtle">
          Recipes: USDA MyPlate Kitchen &middot; Nutrition: USDA FoodData
          Central
        </p>
      </div>
    </footer>
  );
}

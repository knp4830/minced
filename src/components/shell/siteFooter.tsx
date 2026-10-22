import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { ME_ENABLED } from "@/lib/me/flag";
import { cn } from "@/lib/utils";

/*
 * Brand and a one-line promise on the left, two short link groups on the right.
 * The first version was one slim line on purpose, so it couldn't read as a navbar at
 * the bottom of the page. Now that the landing page is where new people arrive, the
 * footer is the place they look for "where is the fridge thing" and "who made this",
 * so it carries the five places people ask for plus the legal and source pages, and
 * stays two columns small. Attribution stays a single mono line. `flush` drops the top
 * margin where a coloured band sits above.
 */
const GROUPS = [
  {
    label: "Use Minced",
    links: [
      ["/recipes", "Browse recipes"],
      ["/pantry", "Cook from what you have"],
      ["/shopping", "Shopping list"],
      ...(ME_ENABLED ? ([["/me", "Me: nutrition and workouts"]] as const) : []),
    ],
  },
  {
    label: "About",
    links: [
      ["/about", "How recipes are made"],
      ["/about#usda", "Data sources"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ],
  },
] as const;

const linkClass =
  "inline-flex min-h-11 items-center text-[0.8125rem] text-ink-muted underline underline-offset-4 hover:text-herb";

export function SiteFooter({ flush = false }: { flush?: boolean }) {
  return (
    <footer className={cn("border-t border-line bg-band", !flush && "mt-16")}>
      <div className="grid page-w gap-x-12 gap-y-4 py-6 md:grid-cols-[1fr_auto] md:py-8">
        <div>
          <Wordmark className="self-start text-[1.0625rem]" />
          <p className="max-w-[28em] text-sm leading-normal text-ink-muted">
            Recipes you can search by name or by what’s in your fridge, with the numbers up front.
          </p>
          <p className="mt-3 font-mono text-[0.6875rem] leading-relaxed text-ink-subtle">
            Recipes: USDA MyPlate Kitchen &middot; Nutrition: USDA FoodData Central
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-12">
          {GROUPS.map((g) => (
            <nav key={g.label} aria-label={g.label} className="flex flex-col">
              <span className="label-mono mb-1">{g.label}</span>
              {g.links.map(([href, label]) => (
                <Link key={href} href={href} className={linkClass}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}

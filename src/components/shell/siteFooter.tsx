import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { cn } from "@/lib/utils";

/*
 * One slim line: brand, attribution, one link. Deliberately not a link list,
 * so it can't read as a navbar at the bottom of the page. On phones the parts
 * stack. `flush` drops the top margin where a coloured band sits above.
 */
export function SiteFooter({ flush = false }: { flush?: boolean }) {
  return (
    <footer className={cn("border-t border-line bg-band", !flush && "mt-16")}>
      <div className="flex page-w flex-col gap-x-5 gap-y-1 py-3 md:flex-row md:items-center md:py-4">
        <Wordmark className="inline-flex min-h-11 items-center self-start text-[1.0625rem]" />
        <span aria-hidden className="hidden text-stone-line md:inline">
          ·
        </span>
        <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-subtle">
          Recipes: USDA MyPlate Kitchen &middot; Nutrition: USDA FoodData Central
        </p>
        <nav
          aria-label="About and legal"
          className="flex flex-wrap items-center gap-x-5 self-start md:ml-auto"
        >
          {[
            ["/about", "How recipes are made"],
            ["/privacy", "Privacy"],
            ["/terms", "Terms"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center text-[0.8125rem] text-ink-muted underline underline-offset-4 hover:text-herb"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

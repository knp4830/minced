import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { RecipeCard, type RecipeCardProps } from "@/components/recipe/recipeCard";

export type RecipeListProps = {
  recipes: RecipeCardProps[];
  /** Shown when `recipes` is empty. Each door supplies its own words. */
  empty?: ReactNode;
  /** URL of the next page (cursor already in it); omit on the last page. */
  nextHref?: string | null;
  /** Accessible name for the list. */
  label?: string;
};

/**
 * Responsive grid of RecipeCards per design/HANDOFF.md: auto-fill with a 150px
 * minimum on phones (two columns at 375px), 232px from sm.
 * Pagination is a plain link to `nextHref` (cursor lives in the URL), so it
 * works without JavaScript. Server component.
 */
export function RecipeList({
  recipes,
  empty,
  nextHref,
  label = "Recipes",
}: RecipeListProps) {
  if (recipes.length === 0) {
    return <div data-slot="recipe-list-empty">{empty}</div>;
  }

  return (
    <div data-slot="recipe-list">
      <ul
        aria-label={label}
        className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))] sm:gap-[18px]"
      >
        {recipes.map((r, i) => (
          <li key={r.slug} className="min-w-0">
            <RecipeCard {...r} priority={r.priority ?? i < 2} />
          </li>
        ))}
      </ul>
      {nextHref && (
        <div className="mt-8 flex justify-center">
          <Link href={nextHref} className={buttonVariants({ variant: "secondary" })}>
            Show more
          </Link>
        </div>
      )}
    </div>
  );
}

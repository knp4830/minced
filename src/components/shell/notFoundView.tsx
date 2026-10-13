import { Search } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/*
 * The body of every "not found" screen: say what happened in one line, then give
 * three ways forward (search, browse, home). A server component with a plain GET
 * search form, so it works without JavaScript. The site shell (header/footer)
 * comes from the layout, or from app/not-found.tsx where there is no layout.
 */
export function NotFoundView({
  title,
  message,
  searchPlaceholder = "Search recipes",
  primary = { href: "/recipes", label: "Browse all recipes" },
}: {
  title: string;
  message: string;
  searchPlaceholder?: string;
  primary?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-[34rem] px-(--gutter) py-14 text-center md:py-20">
      <p className="label-mono mb-3 tracking-[0.1em]">Error 404</p>
      <h1 className="text-[2rem] leading-[1.05] md:text-[2.5rem]">{title}</h1>
      <p className="mx-auto mt-3 max-w-[28em] text-[0.9375rem] leading-relaxed text-ink-muted">
        {message}
      </p>

      <form
        role="search"
        action="/recipes"
        method="get"
        className="mx-auto mt-7 flex min-h-12 max-w-[26rem] items-center gap-2 rounded-field border border-line bg-sunken px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20"
      >
        <Search aria-hidden className="size-4 shrink-0 text-stone" />
        <label htmlFor="not-found-search" className="sr-only">
          Search recipes
        </label>
        <input
          id="not-found-search"
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={searchPlaceholder}
          className="w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle sm:text-sm"
        />
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={primary.href} className={buttonVariants({ variant: "primary", size: "md" })}>
          {primary.label}
        </Link>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
          Back to home
        </Link>
      </div>
    </div>
  );
}

/** The unknown-recipe variant, shared by the middleware rewrite target and [slug]/not-found.tsx. */
export function RecipeNotFoundView() {
  return (
    <NotFoundView
      title="That recipe isn't here"
      message="It may have been renamed, or merged with a duplicate. Search for it by name, or browse the whole catalog."
      searchPlaceholder="Search for a recipe"
      primary={{ href: "/recipes", label: "Back to recipes" }}
    />
  );
}

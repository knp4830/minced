"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/*
 * The header's recipe search. A plain GET form to /recipes?q=, so it works
 * without JavaScript; the client part only keeps the current query in the box
 * after submitting (on /recipes) so a cook can refine it instead of retyping.
 *
 * The query is read from window.location after mount rather than with
 * useSearchParams: the header lives in a layout shared with statically cached
 * pages, and useSearchParams there needs a Suspense boundary that (measured)
 * never swapped in. Submitting is a full page load, so a mount-time read is
 * enough; the pathname dependency covers client navigations away and back.
 */
export function HeaderSearch() {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    input.value =
      pathname === "/recipes" ? (new URLSearchParams(window.location.search).get("q") ?? "") : "";
  }, [pathname]);

  return (
    <form
      role="search"
      action="/recipes"
      method="get"
      className="order-last flex min-h-11 w-full items-center gap-2 rounded-field border border-line bg-sunken px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20 md:order-none md:max-w-[26rem] md:min-w-[11rem] md:flex-1"
    >
      <Search aria-hidden className="size-4 shrink-0 text-stone" />
      <label htmlFor="site-search" className="sr-only">
        Search recipes
      </label>
      <input
        ref={inputRef}
        id="site-search"
        name="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search recipes"
        className="w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle sm:text-sm"
      />
    </form>
  );
}

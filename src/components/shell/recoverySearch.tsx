import { Search } from "lucide-react";

/*
 * The search box on "not found" and "something went wrong" screens. A plain GET form to /recipes, so it
 * works without JavaScript and while the rest of the page is broken. No "use client": it is imported by
 * a server component (NotFoundView) and a client one (ErrorView), and needs no state.
 */
export function RecoverySearch({ id, placeholder = "Search recipes" }: { id: string; placeholder?: string }) {
  return (
    <form
      role="search"
      action="/recipes"
      method="get"
      className="mx-auto mt-7 flex min-h-12 max-w-[26rem] items-center gap-2 rounded-field border border-field bg-sunken px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20"
    >
      <Search aria-hidden className="size-4 shrink-0 text-stone" />
      <label htmlFor={id} className="sr-only">
        Search recipes
      </label>
      <input
        id={id}
        name="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle sm:text-sm"
      />
    </form>
  );
}

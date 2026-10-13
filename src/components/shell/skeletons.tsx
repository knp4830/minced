import { cn } from "@/lib/utils";

/*
 * Loading shapes for the dynamic routes (`loading.tsx`). They mirror the real
 * layout so nothing jumps when content arrives, and they only pulse for people
 * who have not asked for reduced motion. Server components, no JS.
 */

function Bar({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-xs bg-sunken motion-safe:animate-pulse", className)} />;
}

/** Same grid as RecipeList, same card proportions (4:3 media, title, spec strip). */
export function RecipeGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading recipes">
      <span className="sr-only">Loading recipes…</span>
      <ul
        aria-hidden
        className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))] sm:gap-[18px]"
      >
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
            <div className="aspect-[4/3] bg-hatch" />
            <div className="px-4 pt-3.5 pb-4">
              <Bar className="mb-2 h-4 w-4/5" />
              <Bar className="mb-4 h-4 w-3/5" />
              <Bar className="h-3 w-2/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** /recipes: heading, count line, filter button on phones, rail on desktop, grid. */
export function BrowseSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-(--gutter) py-6 md:py-8">
      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-0">
        <div aria-hidden className="hidden space-y-6 lg:block lg:border-r lg:border-line lg:pr-5">
          <Bar className="h-5 w-20" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2.5">
              <Bar className="h-3 w-24" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 4 }, (_, j) => (
                  <Bar key={j} className="h-8 w-16 rounded-md" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="min-w-0 lg:pl-8">
          <Bar className="mb-2 h-8 w-44 md:h-9" />
          <Bar className="mb-5 h-3 w-24" />
          <Bar className="mb-5 h-11 w-28 rounded-md lg:hidden" />
          <RecipeGridSkeleton count={8} />
        </div>
      </div>
    </div>
  );
}

/** /pantry: title, intro, picker button, results. */
export function PantrySkeleton() {
  return (
    <div className="mx-auto max-w-[1180px] px-(--gutter) py-8 md:py-12">
      <Bar className="h-8 w-60 md:h-10" />
      <Bar className="mt-3 h-4 w-full max-w-[34em]" />
      <Bar className="mt-2 h-4 w-2/3 max-w-[24em]" />
      <Bar className="mt-6 h-11 w-52 rounded-md" />
      <div className="mt-10">
        <Bar className="mb-4 h-6 w-40" />
        <RecipeGridSkeleton count={6} />
      </div>
    </div>
  );
}

/** /recipes/[slug]: title block, photo, ingredient and step columns. */
export function RecipeSkeleton() {
  return (
    <div role="status" aria-label="Loading recipe" className="mx-auto max-w-[1180px] px-(--gutter) pt-4 pb-6 md:pt-6">
      <span className="sr-only">Loading recipe…</span>
      <div aria-hidden>
        <Bar className="mt-3 mb-5 h-4 w-24" />
        <Bar className="mb-4 h-9 w-3/4 md:h-11" />
        <Bar className="mb-6 h-11 w-full rounded-none" />
        <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[17.5rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="aspect-[16/9] rounded-xl border border-line bg-hatch sm:aspect-[2/1] lg:aspect-[4/5]" />
          <div className="space-y-3">
            {Array.from({ length: 7 }, (_, i) => (
              <Bar key={i} className="h-5 w-full" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Bar key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

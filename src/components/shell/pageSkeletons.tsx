import { Bar, RecipeGridSkeleton } from "@/components/shell/skeletons";
import { cn } from "@/lib/utils";

/*
 * Loading shapes for the rest of the routes (`loading.tsx`), one per page layout. Each mirrors the
 * real page's container, heading sizes and block heights so nothing jumps when content arrives, and
 * they pulse only for people who have not asked for reduced motion. The recipe browse, recipe page,
 * and pantry shapes live in skeletons.tsx. Server components, no JS.
 *
 * Every page skeleton is one `role="status"` region that says what is loading once; the grey shapes
 * inside are hidden from screen readers.
 */

function Frame({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      <span className="sr-only">{label}…</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/** A raised card with a heading bar and a few lines, the shape most dashboard panels share. */
function CardShape({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-5", className)}>
      <Bar className="mb-4 h-5 w-32" />
      <div className="space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** /account: avatar and name, the section tabs, then the saved-recipes grid. */
export function AccountSkeleton() {
  return (
    <Frame label="Loading your account" className="page-w py-6 md:py-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="size-[60px] shrink-0 rounded-full bg-sunken motion-safe:animate-pulse" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-[2.03rem] w-48 md:h-10" />
          <Bar className="h-4 w-56 max-w-full" />
        </div>
        <Bar className="h-11 w-24 rounded-lg" />
      </div>
      <div className="mt-7 flex flex-wrap gap-2">
        <Bar className="h-11 w-32 rounded-sheet" />
        <Bar className="h-11 w-36 rounded-sheet" />
        <Bar className="h-11 w-24 rounded-sheet" />
      </div>
      <div className="mt-7">
        <Bar className="mb-4 h-6 w-44" />
        <RecipeGridSkeleton count={4} nested />
      </div>
    </Frame>
  );
}

/** /me: title and day picker, then the two dashboard columns (one column on phones). */
export function MeSkeleton() {
  return (
    <Frame label="Loading your day" className="me-scope page-w py-6 md:py-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Bar className="h-7 w-14 md:h-8" />
        <Bar className="h-11 w-56 rounded-lg" />
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 md:mt-6 md:gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-5 md:gap-6 lg:order-2 lg:col-span-7">
          <CardShape className="h-52" lines={3} />
          <CardShape className="h-72" lines={5} />
          <CardShape className="h-60" lines={4} />
        </div>
        <div className="flex flex-col gap-5 md:gap-6 lg:order-1 lg:col-span-5">
          <CardShape className="h-80" lines={5} />
          <CardShape className="h-36" lines={2} />
          <CardShape className="h-80" lines={5} />
        </div>
      </div>
    </Frame>
  );
}

/** /fridge: title, intro, buttons, then rows grouped by aisle. */
export function FridgeSkeleton() {
  return (
    <Frame label="Loading your fridge" className="page-w py-8 md:py-12">
      <Bar className="h-[1.84rem] w-40 md:h-[2.36rem]" />
      <div className="mt-2 flex min-h-[3.05rem] flex-col justify-center gap-2">
        <Bar className="h-4 w-full max-w-[34em]" />
        <Bar className="h-4 w-2/3 max-w-[24em]" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Bar className="h-11 w-44 rounded-lg" />
        <Bar className="h-11 w-48 rounded-lg" />
      </div>
      <div className="mt-6 space-y-7">
        {[4, 3].map((rows, g) => (
          <div key={g}>
            <Bar className="mb-3 h-4 w-28" />
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <Bar className="h-4 w-40" />
                  <Bar className="ml-auto h-9 w-28 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** /shopping: title, hint, then aisle groups of rows. */
export function ShoppingSkeleton() {
  return (
    <Frame label="Loading your shopping list" className="page-w py-6 md:py-10">
      <Bar className="mb-1 h-10 w-52" />
      <div className="mb-5 flex h-[23px] items-center">
        <Bar className="h-4 w-60" />
      </div>
      <div className="space-y-6">
        {[3, 3].map((rows, g) => (
          <div key={g}>
            <Bar className="mb-2 h-4 w-24" />
            <div className="divide-y divide-line">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex min-h-12 items-center gap-3 py-2">
                  <Bar className="size-5 rounded-md" />
                  <Bar className="h-4 w-48 max-w-[60%]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** /about: a title rail, then readable sections (the same frame /privacy and /terms use). */
export function ArticleSkeleton({ label = "Loading the page" }: { label?: string }) {
  return (
    <Frame label={label} className="page-w py-8 md:py-14 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,46rem)] lg:gap-x-20">
      <div>
        <Bar className="h-[2.1rem] w-4/5 md:h-[2.89rem]" />
        <Bar className="mt-4 h-4 w-full" />
        <Bar className="mt-2 h-4 w-3/4" />
      </div>
      <div className="mt-10 space-y-9 lg:mt-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2.5">
            <Bar className="mb-4 h-6 w-3/5" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** The recipe form (new and edit): kicker, title, a few fields, the ingredient block. */
export function FormSkeleton({ label = "Loading the recipe form" }: { label?: string }) {
  return (
    <Frame label={label} className="mx-auto max-w-[820px] px-(--gutter) pt-6 pb-10 md:pt-10">
      <Bar className="h-3 w-24" />
      <Bar className="mt-3 h-8 w-64 md:h-9" />
      <div className="mt-8 space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Bar className="mb-2 h-3 w-24" />
            <Bar className="h-12 w-full rounded-field" />
          </div>
        ))}
        <div>
          <Bar className="mb-2 h-3 w-28" />
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Bar key={i} className="h-12 w-full rounded-field" />
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** The log in / sign up card, shaped like the AuthPanel inside the (auth) layout. */
export function AuthSkeleton() {
  return (
    <Frame label="Loading" className="min-h-[22rem]">
      <Bar className="h-8 w-40" />
      <Bar className="mt-3 h-4 w-full" />
      <div className="mt-7 space-y-5">
        <div>
          <Bar className="mb-2 h-3 w-16" />
          <Bar className="h-12 w-full rounded-field" />
        </div>
        <div>
          <Bar className="mb-2 h-3 w-20" />
          <Bar className="h-12 w-full rounded-field" />
        </div>
        <Bar className="h-12 w-full rounded-lg" />
      </div>
    </Frame>
  );
}

/** The landing page: green nav bar, then the dark photo hero with headline and search box. */
export function LandingSkeleton() {
  return (
    <Frame label="Loading Minced">
      <div className="border-b border-herb-deep bg-herb">
        <div className="flex page-w items-center gap-4 py-3 md:py-5">
          <div className="h-7 w-24 rounded-xs bg-on-herb/20 motion-safe:animate-pulse" />
          <div className="ml-auto h-6 w-40 rounded-xs bg-on-herb/20 motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="flex min-h-[620px] flex-col bg-night pb-8 md:min-h-[min(740px,calc(100svh-4.5rem))] md:pb-12">
        <div className="mt-auto page-w pt-16">
          <div className="mb-4 h-4 w-40 rounded-xs bg-on-night/15 motion-safe:animate-pulse" />
          <div className="h-12 w-4/5 max-w-[12em] rounded-xs bg-on-night/15 motion-safe:animate-pulse md:h-20" />
          <div className="mt-4 h-5 w-full max-w-[34em] rounded-xs bg-on-night/15 motion-safe:animate-pulse" />
          <div className="mt-6 h-[4.5rem] max-w-[40rem] rounded-2xl bg-surface/90 sm:h-[4.25rem]" />
        </div>
      </div>
    </Frame>
  );
}

/** /admin/review/list: title, the progress header, a table of rows. */
export function AdminListSkeleton() {
  return (
    <Frame label="Loading the review list" className="page-w space-y-5 py-5">
      <Bar className="h-7 w-44" />
      <Bar className="h-20 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 10 }, (_, i) => (
          <Bar key={i} className="h-11 w-full rounded-md" />
        ))}
      </div>
    </Frame>
  );
}

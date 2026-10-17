import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect, redirect } from "next/navigation";

import { USER_RECIPES_ENABLED } from "@/lib/flags";
import { MyRecipeBook } from "@/components/account/myRecipeBook";
import { ComingSoon } from "@/components/shell/comingSoon";
import { RecipeList } from "@/components/recipe/recipeList";
import { Button, buttonVariants } from "@/components/ui/button";
import { SignOutForm } from "@/components/account/signOutForm";
import { getCurrentUser } from "@/lib/queries/account";
import { getFavoriteCards } from "@/lib/queries/favorites";
import { listMyRecipes } from "@/lib/queries/myRecipes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

const TABS = [
  { id: "library", label: "My Library" },
  { id: "book", label: "My recipes" },
] as const;
type TabId = (typeof TABS)[number]["id"];
// "My recipes" is always listed. Until user recipes are switched on (see src/lib/flags.ts)
// it shows a coming-soon note instead of the book.
// Settings used to be a third tab here; it is its own page now (/settings), linked after the tabs.

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccountPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  // Old links (and the cookware filter's "manage" link) point at the former Settings tab: send them on, 308.
  if (rawTab === "settings") permanentRedirect("/settings");
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "library";
  const notice = (Array.isArray(sp.notice) ? sp.notice[0] : sp.notice) === "password";

  // Middleware already redirects signed-out visitors; this is the real check.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount");

  const saved = tab === "library" ? await getFavoriteCards() : [];
  const mine = tab === "book" && USER_RECIPES_ENABLED ? await listMyRecipes() : [];
  const rawFlash = Array.isArray(sp.notice) ? sp.notice[0] : sp.notice;
  const flash = tab === "book" && rawFlash ? rawFlash : null;

  return (
    <div className="page-w py-6 md:py-10">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <span
          aria-hidden
          className="flex size-[60px] shrink-0 items-center justify-center rounded-full bg-herb font-display text-[1.625rem] font-semibold text-on-herb"
        >
          {user.initial}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.625rem] leading-tight md:text-[2rem]">{user.name}</h1>
          <p title={user.email} className="truncate font-mono text-[0.8125rem] text-ink-muted">{user.email}</p>
        </div>
        <SignOutForm>
          <Button type="submit" variant="secondary" className="text-paprika-deep">
            Sign out
          </Button>
        </SignOutForm>
      </header>

      {notice && (
        <p role="status" className="mt-5 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-[0.875rem]">
          Password changed.
        </p>
      )}

      <nav aria-label="Account sections" className="mt-7 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "library" ? "/account" : `/account?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-sheet border px-4 text-[0.875rem] font-medium transition-colors",
              t.id === tab
                ? "border-ink bg-ink text-canvas"
                : "border-line-strong text-ink hover:border-herb hover:text-herb",
            )}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center rounded-sheet border border-line-strong px-4 text-[0.875rem] font-medium text-ink transition-colors hover:border-herb hover:text-herb"
        >
          Settings
        </Link>
      </nav>

      <section className="mt-7" aria-labelledby="tab-h">
        {tab === "library" && (
          <>
            <h2 id="tab-h" className="mb-4 flex items-baseline gap-3 text-xl">
              Saved recipes
              <span className="font-mono text-[0.8125rem] font-normal text-ink-muted">{saved.length}</span>
            </h2>
            <RecipeList
              recipes={saved}
              label="Saved recipes"
              empty={
                <div className="max-w-md rounded-xl border border-line bg-surface px-6 py-8">
                  <p className="text-[1.0625rem]">Nothing saved yet. Tap the star on any recipe.</p>
                  <Link href="/recipes" className={cn(buttonVariants({ variant: "primary" }), "mt-4")}>
                    Browse recipes
                  </Link>
                </div>
              }
            />
          </>
        )}

        {tab === "book" &&
          (USER_RECIPES_ENABLED ? (
            <MyRecipeBook recipes={mine} notice={flash} />
          ) : (
            <ComingSoon title="Your own recipes, in one place">
              <p>
                Write down the dishes you make your way, with your own amounts and steps, and keep them next
                to everything you have saved. It is on its way.
              </p>
            </ComingSoon>
          ))}

      </section>
    </div>
  );
}

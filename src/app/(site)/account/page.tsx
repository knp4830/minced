import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteAccountForm } from "@/components/account/authForms";
import { USER_RECIPES_ENABLED } from "@/lib/flags";
import { MyRecipeBook } from "@/components/account/myRecipeBook";
import { ComingSoon } from "@/components/shell/comingSoon";
import { RecipeList } from "@/components/recipe/recipeList";
import { Button, buttonVariants } from "@/components/ui/button";
import { logOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/queries/account";
import { getFavoriteCards } from "@/lib/queries/favorites";
import { listMyRecipes } from "@/lib/queries/myRecipes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

const ALL_TABS = [
  { id: "library", label: "My Library" },
  { id: "book", label: "My recipes" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof ALL_TABS)[number]["id"];
// "My recipes" is always listed. Until user recipes are switched on (see src/lib/flags.ts)
// it shows a coming-soon note instead of the book.
const TABS = ALL_TABS;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccountPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
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
        <form action={logOut}>
          <Button type="submit" variant="secondary" className="text-paprika-deep">
            Sign out
          </Button>
        </form>
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

        {tab === "settings" && (
          <>
            <h2 id="tab-h" className="mb-4 text-xl">
              Settings
            </h2>
            <div className="max-w-xl space-y-8">
              <div>
                <h3 className="text-base font-semibold">Your data</h3>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                  Minced stores your email, the recipes you save, your cookware, your fridge (with dates and amounts), your shopping list, and security sign-in logs. Without an account, your shopping list stays in this browser only.{" "}
                  <Link href="/privacy" className="underline underline-offset-4 hover:text-herb">
                    Read the privacy policy
                  </Link>
                  .
                </p>
                <a
                  href="/api/me/export"
                  download
                  className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium underline underline-offset-4 hover:text-herb"
                >
                  Download my data
                </a>
              </div>
              <div>
                <h3 className="text-base font-semibold">Delete your account</h3>
                <p className="mt-1.5 mb-4 text-[0.9375rem] leading-relaxed text-ink-muted">
                  Removes your login, saved recipes, fridge and shopping list right away. This can&apos;t be undone.
                </p>
                <DeleteAccountForm />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

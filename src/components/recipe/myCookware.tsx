"use client";

import { useId, useOptimistic, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/account/accountProvider";
import { startNavProgress } from "@/components/shell/navProgress";
import { cookwareUrl, writeCookware, type StoredCookware } from "@/lib/cookwareStorage";
import { cn } from "@/lib/utils";

/*
 * "My cookware": a switch that hides every recipe needing something the cook lacks,
 * Signed-in cooks only; signed-out visitors do not see it, though a shared link's
 * ownedCookware still filters. This is the switch alone: the list of pots and pans lives in
 * the account (Settings > cookware, see CookwareEditor) and the link below goes there.
 * Rendered inside the filter rail, the phone filter sheet and the fridge page.
 *
 * State lives in the URL (`ownedCookware`, `ownedOnly`) like every other filter.
 * Each change also goes to localStorage; see CookwareSync for the way back. The switch
 * repaints instantly (useOptimistic) and the results catch up behind the progress bar.
 */

type Props = {
  owned: string[];
  only: boolean;
  /** The whole cookware vocabulary. */
  all: { slug: string; name: string }[];
};

export function MyCookware({ owned, only, all }: Props) {
  const router = useRouter();
  const { status } = useAccount();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useOptimistic<StoredCookware, StoredCookware>(
    { slugs: owned, only },
    (_current, next) => next,
  );

  // Signed-in only: the list is saved to the account. A shared link's ownedCookware still filters.
  if (all.length === 0 || status !== "in") return null;

  function apply(next: StoredCookware) {
    startNavProgress();
    writeCookware(next);
    startTransition(() => {
      setView(next);
      router.push(cookwareUrl(next), { scroll: false });
    });
  }

  return (
    <fieldset className="mb-5 min-w-0" aria-busy={pending}>
      <legend className="label-mono mb-2.5">My cookware</legend>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id={`${uid}-label`} className="text-[0.875rem] leading-snug text-ink">
          Only what I can make with my cookware
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={view.only}
          aria-labelledby={`${uid}-label`}
          aria-describedby={`${uid}-hint`}
          onClick={() => apply({ slugs: view.slugs, only: !view.only })}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150",
            "before:absolute before:-inset-2 before:content-['']", // 44px touch target around the 28px track
            view.only ? "border-herb bg-herb" : "border-field bg-track",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "block size-5 rounded-full bg-surface shadow-sm transition-transform duration-150",
              view.only ? "translate-x-[1.375rem]" : "translate-x-[0.1875rem]",
            )}
          />
        </button>
      </div>
      <p id={`${uid}-hint`} className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
        {view.only && view.slugs.length === 0
          ? "No cookware saved yet, so recipes that need any pan or pot are hidden."
          : "Recipes that list no cookware always show."}
      </p>
      <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
        <Link href="/account?tab=settings#cookware" className="underline underline-offset-2 hover:text-herb">
          Choose which cookware I own
        </Link>
      </p>
    </fieldset>
  );
}

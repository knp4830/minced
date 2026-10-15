"use client";

import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/account/accountProvider";
import { startNavProgress } from "@/components/shell/navProgress";
import { Chip } from "@/components/ui/chip";
import { saveMyCookware } from "@/lib/actions/cookware";
import { cookwareUrl, writeCookware, type StoredCookware } from "@/lib/cookwareStorage";
import { cn } from "@/lib/utils";

/*
 * "My cookware": a switch that hides every recipe needing something the cook lacks,
 * and, for people WITHOUT an account, the list of pots and pans they own (kept on this
 * device). Signed-in people get the switch only: their list belongs to their account, and
 * the filter panel just links there. Rendered inside the filter rail, the phone filter
 * sheet and the fridge page, so both doors filter the same way.
 *
 * State lives in the URL (`ownedCookware`, `ownedOnly`) like every other filter.
 * Each change also goes to localStorage, and to the account when signed in; see
 * CookwareSync for the way back. The chips repaint instantly (useOptimistic) and
 * the results catch up behind the progress bar.
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
  const [saveFailed, setSaveFailed] = useState(false);
  // Account saves run one at a time, last write wins.
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  if (all.length === 0) return null;

  function apply(next: StoredCookware) {
    startNavProgress();
    writeCookware(next);
    startTransition(() => {
      setView(next);
      router.push(cookwareUrl(next), { scroll: false });
    });
    if (status === "in") {
      saving.current = saving.current.then(() =>
        saveMyCookware(next.slugs)
          .then((r) => setSaveFailed(!r.ok))
          .catch(() => setSaveFailed(true)),
      );
    }
  }

  function toggleOwned(slug: string) {
    const slugs = view.slugs.includes(slug)
      ? view.slugs.filter((s) => s !== slug)
      : [...view.slugs, slug];
    apply({ slugs, only: view.only });
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
          ? status === "out"
            ? "Pick what you own below. With nothing picked, recipes that need any pan or pot are hidden."
            : "With no cookware saved, recipes that need any pan or pot are hidden."
          : "Recipes that list no cookware always show."}
      </p>
      {status === "out" ? (
        // No account: the list lives on this device, so it is edited here. Collapsed once it has content.
        <details open={view.only && view.slugs.length === 0} className="group/own mt-3">
          <summary className="label-mono flex min-h-8 cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden">
            <span>Cookware I own{view.slugs.length ? ` (${view.slugs.length})` : ""}</span>
            <span aria-hidden className="group-open/own:hidden">show</span>
            <span aria-hidden className="hidden group-open/own:inline">hide</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {all.map((c) => (
              <Chip
                key={c.slug}
                selected={view.slugs.includes(c.slug)}
                onClick={() => toggleOwned(c.slug)}
              >
                {c.name}
              </Chip>
            ))}
          </div>
        </details>
      ) : status === "in" ? (
        <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
          <Link href="/account#cookware" className="underline underline-offset-2 hover:text-herb">
            Manage my cookware in your account
          </Link>
        </p>
      ) : null}
      {saveFailed && (
        <p role="status" className="mt-1 text-[0.8125rem] text-paprika-deep">
          Couldn&apos;t save this to your account. It&apos;s still kept on this device.
        </p>
      )}
    </fieldset>
  );
}

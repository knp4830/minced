"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { Button } from "@/components/ui/button";
import { importToFridge } from "@/lib/actions/fridge";
import { announceFridgeChanged, fetchSavedFridge } from "@/lib/fridgeClient";
import { todayIso } from "@/lib/fridgeDates";
import { readFridge, writeFridge, type FridgeItem } from "@/lib/fridgeStorage";
import { cn } from "@/lib/utils";

/**
 * First sign-in with a fridge already picked in this browser: offer to keep it.
 *
 * Shows only when someone is signed in AND this browser's local fridge holds
 * something their saved fridge lacks. Either answer empties the local copy, so
 * the question is asked once. If the local items are all saved already, the
 * local copy is cleared silently.
 */
export function LocalFridgeImport({ className }: { className?: string }) {
  const { status } = useAccount();
  const router = useRouter();
  const [offer, setOffer] = useState<FridgeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status !== "in") return;
    const local = readFridge();
    if (local.length === 0) return;
    let cancelled = false;
    (async () => {
      const saved = await fetchSavedFridge();
      if (cancelled || !saved) return;
      const have = new Set(saved.items.map((i) => i.id));
      const extra = local.filter((i) => !have.has(i.id));
      if (extra.length === 0) writeFridge([]);
      else setOffer(extra);
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (offer.length === 0) return null;

  async function accept() {
    setBusy(true);
    setFailed(false);
    try {
      const r = await importToFridge(
        offer.map((i) => i.id),
        todayIso(),
      );
      if (!r.ok) {
        setFailed(true);
        return;
      }
      writeFridge([]);
      setOffer([]);
      announceFridgeChanged();
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    writeFridge([]);
    setOffer([]);
  }

  return (
    <section
      aria-labelledby="import-fridge-h"
      className={cn("rounded-lg border border-line-strong bg-surface p-4", className)}
    >
      <h2 id="import-fridge-h" className="text-[1rem]">
        Keep the fridge from this browser?
      </h2>
      <p className="mt-1 text-[0.875rem] leading-snug text-ink-muted">
        You picked {offer.length} {offer.length === 1 ? "thing" : "things"} here before signing in:{" "}
        <span className="text-ink">
          {offer
            .slice(0, 5)
            .map((i) => i.name)
            .join(", ")}
          {offer.length > 5 && ` and ${offer.length - 5} more`}
        </span>
        . Add {offer.length === 1 ? "it" : "them"} to your saved fridge so it is there on every
        device.
      </p>
      {failed && (
        <p role="alert" className="mt-2 text-[0.8125rem] text-paprika-deep">
          Could not save them just now. Try again.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button size="md" onClick={accept} disabled={busy}>
          {busy ? "Adding…" : "Add to my fridge"}
        </Button>
        <Button size="md" variant="secondary" onClick={decline} disabled={busy}>
          No thanks
        </Button>
      </div>
    </section>
  );
}

/** "Dates and expiry" link to /fridge, shown only to signed-in visitors. */
export function FridgeDatesLink({ className }: { className?: string }) {
  const { status } = useAccount();
  if (status !== "in") return null;
  return (
    <Link
      href="/fridge"
      className={cn(
        "inline-flex min-h-11 items-center text-[0.8125rem] font-medium underline underline-offset-4 hover:text-herb",
        className,
      )}
    >
      Dates and what to use first
    </Link>
  );
}

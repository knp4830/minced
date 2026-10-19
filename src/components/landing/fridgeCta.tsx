"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { buttonVariants } from "@/components/ui/button";
import { fetchSavedFridge } from "@/lib/fridgeClient";
import type { FridgeItem } from "@/lib/fridgeStorage";

const SHOWN = 8;

/**
 * The call to action under "Cook from what you have". The landing page is cached for everyone, so the
 * server HTML offers "Create an account" and "Log in"; a signed-in visitor gets their own fridge instead,
 * read after load from /api/fridge (the database; nothing is kept in the browser).
 */
export function FridgeCta() {
  const { status, me } = useAccount();
  const signedIn = status === "in" && !!me;
  const [items, setItems] = useState<FridgeItem[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void fetchSavedFridge().then((saved) => {
      if (!cancelled) setItems(saved ? saved.items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link href="/signup?next=%2Fpantry" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Create an account
        </Link>
        <Link href="/login?next=%2Fpantry" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      {items === null ? (
        <p className="text-[0.9375rem] text-ink-muted" role="status">
          Opening your fridge…
        </p>
      ) : items.length === 0 ? (
        <p className="max-w-[34em] text-[0.9375rem] leading-snug text-ink-muted">
          Your fridge is empty. Add what you have and Minced shows what you can cook.
        </p>
      ) : (
        <>
          <p className="label-mono mb-2">
            In your fridge · <span className="font-mono">{items.length}</span>
          </p>
          <ul aria-label="In your fridge" className="flex flex-wrap gap-1.5">
            {items.slice(0, SHOWN).map((i) => (
              <li
                key={i.id}
                className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[0.8125rem] text-ink"
              >
                {i.name}
              </li>
            ))}
            {items.length > SHOWN && (
              <li className="px-1 py-1 text-[0.8125rem] text-ink-muted">+{items.length - SHOWN} more</li>
            )}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/pantry" className={buttonVariants({ variant: "primary", size: "lg" })}>
          {items && items.length === 0 ? "Add what I have" : "See what I can make"}
        </Link>
        <Link href="/fridge" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Manage my fridge
        </Link>
      </div>
    </div>
  );
}

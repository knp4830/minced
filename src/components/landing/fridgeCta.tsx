"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { buttonVariants } from "@/components/ui/button";
import { fetchSavedFridge } from "@/lib/fridgeClient";
import type { FridgeItem } from "@/lib/fridgeStorage";
import { cn } from "@/lib/utils";

const SHOWN = 8;

/** Signed out: a few everyday things, so "what's in my fridge" reads as a picture, not a form. */
const EXAMPLE = ["eggs", "spinach", "feta", "tomatoes", "onion", "rice"] as const;

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
      <>
        <p className="label-mono mb-2">For example</p>
        <ul aria-label="An example fridge" className="mb-6 flex flex-wrap items-center gap-1.5">
          {EXAMPLE.map((name) => (
            <li
              key={name}
              className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[0.8125rem] text-ink"
            >
              {name}
            </li>
          ))}
          <li className="rounded-md bg-saffron-tint px-2.5 py-1 font-mono text-[0.75rem] text-saffron-ink">
            Make now
          </li>
        </ul>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/signup?next=%2Fpantry"
          className={cn(
            buttonVariants({ variant: "primary", size: "lg" }),
            "h-auto min-h-12 max-w-full whitespace-normal py-2.5 text-center",
          )}
        >
          Create a free account to keep track of your fridge
        </Link>
        <Link href="/login?next=%2Fpantry" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Log in
        </Link>
      </div>
      </>
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
          Your fridge is empty for now. Add what you have and Minced shows what you can cook.
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

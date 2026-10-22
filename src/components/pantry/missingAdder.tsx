"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { addMissingToShoppingList } from "@/lib/actions/fridgeShopping";
import { cn } from "@/lib/utils";

type ItemState = "idle" | "busy" | "added" | "already" | "error";

/**
 * Under a fridge result that is missing a few things: the missing ingredients by name, each one tap to put
 * on the shopping list. A second tap on the same recipe's ingredient never doubles the line (the database
 * skips what is already there). The status line is read out for screen readers.
 */
export function MissingAdder({
  slug,
  have,
  needed,
  missing,
  className,
}: {
  slug: string;
  have: number;
  needed: number;
  missing: { id: number; name: string }[];
  className?: string;
}) {
  const [state, setState] = useState<Record<number, ItemState>>({});
  const [note, setNote] = useState("");

  async function add(ids: number[], label: string) {
    setNote("");
    setState((s) => ({ ...s, ...Object.fromEntries(ids.map((i) => [i, "busy" as const])) }));
    try {
      const r = await addMissingToShoppingList(slug, ids);
      if (r.ok) {
        const next: ItemState = r.added === 0 ? "already" : "added";
        setState((s) => ({ ...s, ...Object.fromEntries(ids.map((i) => [i, next])) }));
        setNote(r.added === 0 ? `${label} was already on your list` : `${label} added to your shopping list`);
        return;
      }
      throw new Error(r.reason);
    } catch {
      setState((s) => ({ ...s, ...Object.fromEntries(ids.map((i) => [i, "error" as const])) }));
      setNote(`Could not add ${label}. Try again.`);
    }
  }

  const open = missing.filter((m) => state[m.id] !== "added" && state[m.id] !== "already");
  const anyDone = missing.some((m) => state[m.id] === "added" || state[m.id] === "already");

  return (
    <div className={cn("rounded-lg border border-line bg-surface px-3 py-2.5", className)}>
      <p className="font-mono text-xs font-semibold text-herb">
        You have {have} of {needed}
      </p>
      <p className="mt-1.5 text-[0.75rem] text-ink-muted">Missing, tap to add to your shopping list</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {missing.map((m) => {
          const s = state[m.id] ?? "idle";
          const done = s === "added" || s === "already";
          return (
            <li key={m.id}>
              <button
                type="button"
                disabled={s === "busy" || done}
                aria-label={done ? `${m.name}, on your shopping list` : `Add ${m.name} to shopping list`}
                onClick={() => void add([m.id], m.name)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1 rounded-md border px-2.5 text-[0.8125rem] font-medium transition-colors pointer-coarse:min-h-11",
                  done
                    ? "border-herb/40 bg-herb/10 text-herb-deep"
                    : s === "error"
                      ? "border-paprika/60 text-paprika-deep"
                      : "border-line-strong text-ink hover:border-herb hover:text-herb disabled:opacity-60",
                )}
              >
                {done ? <Check aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
                {m.name}
              </button>
            </li>
          );
        })}
      </ul>
      {open.length > 1 && (
        <button
          type="button"
          onClick={() =>
            void add(
              open.map((m) => m.id),
              `${open.length} items`,
            )
          }
          className="mt-1.5 inline-flex min-h-9 items-center text-[0.8125rem] font-medium text-ink underline underline-offset-4 hover:text-herb pointer-coarse:min-h-11"
        >
          Add all {open.length}
        </button>
      )}
      {anyDone && (
        <Link
          href="/shopping"
          className="mt-1.5 ml-3 inline-flex min-h-9 items-center text-[0.8125rem] font-medium text-ink underline underline-offset-4 hover:text-herb pointer-coarse:min-h-11"
        >
          View shopping list
        </Link>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>
    </div>
  );
}

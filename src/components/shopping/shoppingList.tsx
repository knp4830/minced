"use client";

import { Check, Printer, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  clearCheckedShopping,
  clearShoppingList,
  removeShoppingItems,
  setShoppingChecked,
} from "@/lib/actions/shopping";
import { formatAmount, pluralUnit } from "@/lib/scaling";
import {
  groupByAisle,
  listStats,
  mergeLines,
  type MergedItem,
  type ShopLine,
} from "@/lib/shopping";
import {
  clearCheckedLocal,
  clearLocal,
  readLocalList,
  removeLocal,
  toggleLocal,
} from "@/lib/shoppingStorage";
import { cn } from "@/lib/utils";

/**
 * The /shopping screen. Two sources, one UI:
 *   account  the server rendered `initial` from the database; ticks and clears
 *            go through Server Actions (optimistic, rolled back on failure);
 *   local    signed out: the list lives in this browser's localStorage.
 *
 * Rows are merged for display (src/lib/shopping.ts); the stored lines stay raw
 * so each keeps its source recipe. Ticking a merged row ticks every line in it.
 */
export function ShoppingList({
  mode,
  initial,
}: {
  mode: "account" | "local";
  initial: ShopLine[];
}) {
  const [lines, setLines] = useState<ShopLine[]>(initial);
  const [loaded, setLoaded] = useState(mode === "account");
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [, startTransition] = useTransition();

  // Server data changed under us (router.refresh after the sign-in merge): take it.
  const [seen, setSeen] = useState(initial);
  if (mode === "account" && initial !== seen) {
    setSeen(initial);
    setLines(initial);
  }

  // The signed-out list can only be read in the browser.
  useEffect(() => {
    if (mode !== "local") return;
    setLines(readLocalList());
    setLoaded(true);
  }, [mode]);

  const merged = useMemo(() => mergeLines(lines), [lines]);
  const groups = useMemo(() => groupByAisle(merged), [merged]);
  const stats = useMemo(() => listStats(merged), [merged]);
  const anyChecked = stats.gathered > 0 || lines.some((l) => l.checked);

  function fail(text: string) {
    setError(text);
  }

  // Latest lines for handlers that run before React has re-rendered (two quick taps).
  const linesRef = useRef(lines);
  linesRef.current = lines;

  function toggle(item: MergedItem) {
    const next = !item.checked;
    const keys = new Set(item.keys);
    const mark = (checked: boolean) =>
      setLines((prev) => prev.map((l) => (keys.has(l.key) ? { ...l, checked } : l)));
    setError(null);
    mark(next);
    if (mode === "local") {
      toggleLocal(item.keys, next);
      return;
    }
    startTransition(async () => {
      let ok = false;
      try {
        ok = await setShoppingChecked(item.keys, next);
      } catch {
        ok = false;
      }
      if (!ok) {
        mark(!next);
        fail("Couldn't save that tick. Check your connection and try again.");
      }
    });
  }

  /** Remove lines, with a way back if the server refuses. */
  function removeLines(pick: (l: ShopLine) => boolean, run: () => Promise<boolean>, failText: string) {
    const removed = linesRef.current.filter(pick);
    setError(null);
    setLines((prev) => prev.filter((l) => !pick(l)));
    startTransition(async () => {
      let ok = false;
      try {
        ok = await run();
      } catch {
        ok = false;
      }
      if (!ok) {
        setLines((prev) => [...prev, ...removed].sort((a, b) => Number(a.key) - Number(b.key) || a.key.localeCompare(b.key)));
        fail(failText);
      }
    });
  }

  function removeItem(item: MergedItem) {
    const keys = new Set(item.keys);
    if (mode === "local") {
      setError(null);
      setLines((prev) => prev.filter((l) => !keys.has(l.key)));
      removeLocal(item.keys);
      return;
    }
    removeLines(
      (l) => keys.has(l.key),
      () => removeShoppingItems(item.keys),
      "Couldn't remove that item. Try again.",
    );
  }

  function clearChecked() {
    if (mode === "local") {
      setError(null);
      setLines((prev) => prev.filter((l) => !l.checked));
      clearCheckedLocal();
      return;
    }
    removeLines((l) => l.checked, clearCheckedShopping, "Couldn't clear the checked items. Try again.");
  }

  function clearEverything() {
    setConfirmAll(false);
    if (mode === "local") {
      setError(null);
      setLines([]);
      clearLocal();
      return;
    }
    removeLines(() => true, clearShoppingList, "Couldn't clear the list. Try again.");
  }

  if (!loaded) {
    // Local list not read yet: hold the space so nothing jumps.
    return <div className="min-h-64" aria-hidden />;
  }

  if (merged.length === 0) {
    return (
      <div className="mx-auto max-w-[40rem] rounded-xl border border-dashed border-line-strong bg-band px-5 py-10 text-center">
        <p className="text-[1.0625rem] font-semibold text-ink">Your list is empty.</p>
        <p className="mx-auto mt-1.5 max-w-[26rem] text-[0.9375rem] leading-relaxed text-ink-muted">
          Open a recipe and tap “Add to shopping list”. Quantities follow the servings you pick,
          and the same ingredient from two recipes becomes one line.
        </p>
        <Link href="/recipes" className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-5")}>
          Browse recipes
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" className="font-mono text-[0.78125rem] text-ink-subtle">
          {stats.gathered} of {stats.total} gathered
          {stats.recipes > 0 && ` · from ${stats.recipes} ${stats.recipes === 1 ? "recipe" : "recipes"}`}
        </p>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {anyChecked && (
            <Button variant="danger" size="sm" onClick={clearChecked}>
              Clear checked
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden />
            Print
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-paprika/30 bg-paprika/5 px-3.5 py-2.5 text-[0.875rem] text-paprika-deep print:hidden">
          {error}
        </p>
      )}

      <div className="columns-1 gap-x-12 lg:columns-2 2xl:columns-3 [&>section]:mb-7">
        {groups.map((g) => (
          <section key={g.aisle} aria-labelledby={`aisle-${g.aisle}`} className="break-inside-avoid">
            <h2
              id={`aisle-${g.aisle}`}
              className="label-mono mb-1 border-b border-line-strong pb-2 text-[0.6875rem] tracking-[0.1em] text-herb uppercase"
            >
              {g.aisle}
            </h2>
            <ul>
              {g.items.map((item) => (
                <li key={item.id} className="flex items-center border-b border-line">
                  <ItemRow item={item} onToggle={() => toggle(item)} />
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    aria-label={`Remove ${item.name}`}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:text-paprika-deep print:hidden"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 print:hidden">
        {mode === "local" && (
          <p className="rounded-lg bg-band px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-ink-muted">
            Saved on this device only.{" "}
            <Link
              href="/login?next=%2Fshopping"
              className="font-semibold text-herb underline underline-offset-2"
            >
              Log in
            </Link>{" "}
            to keep it on every device; what is here moves into your account.
          </p>
        )}
        {confirmAll ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm clearing the list">
            <span className="text-[0.875rem] text-ink">Remove all {stats.total} items?</span>
            <Button variant="danger" size="sm" onClick={clearEverything}>
              Yes, clear the list
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmAll(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            className="min-h-11 self-start rounded-md px-1 text-[0.8125rem] text-ink-muted underline underline-offset-2 hover:text-paprika-deep"
          >
            Clear the whole list
          </button>
        )}
      </div>
    </div>
  );
}

function ItemRow({ item, onToggle }: { item: MergedItem; onToggle: () => void }) {
  const qty =
    item.amount == null
      ? "to taste"
      : `${formatAmount(item.amount)}${item.unit ? ` ${pluralUnit(item.unit, item.amount)}` : ""}`;
  const first = item.recipes[0];
  const more = item.recipes.length - 1;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.checked}
      onClick={onToggle}
      className="group flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-sm px-1 py-2.5 text-left transition-colors hover:bg-ink/4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors print:border-ink",
          item.checked ? "border-herb bg-herb text-on-herb" : "border-outline bg-surface",
        )}
      >
        {item.checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span
        className={cn(
          "w-[5.5rem] shrink-0 font-mono text-[0.84375rem] font-semibold text-herb sm:w-[6.5rem]",
          item.checked && "text-ink-subtle line-through",
        )}
      >
        {qty}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[0.9375rem] leading-snug",
            item.checked && "text-ink-subtle line-through",
          )}
        >
          {item.name}
        </span>
        {first && (
          <span className="mt-1 block w-fit max-w-full rounded-full bg-band px-2.5 py-0.5 font-mono text-[0.6875rem] text-ink-subtle sm:hidden print:hidden">
            <span className="block truncate">
              {first.title}
              {more > 0 && ` +${more}`}
            </span>
          </span>
        )}
      </span>
      {first && (
        <span className="hidden shrink-0 rounded-full bg-band px-2.5 py-0.5 font-mono text-[0.6875rem] text-ink-subtle sm:inline print:inline print:bg-transparent print:px-0">
          <span className="inline-block max-w-[6.5rem] truncate align-bottom print:max-w-none">
            {first.title}
          </span>
          {more > 0 && <span> +{more}</span>}
        </span>
      )}
    </button>
  );
}

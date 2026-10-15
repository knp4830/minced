"use client";

import { Check, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { Button } from "@/components/ui/button";
import { addToShoppingList } from "@/lib/actions/shopping";
import { useFridgeIds } from "@/lib/useFridgeIds";
import { selectForList, type RecipeLineInput } from "@/lib/shopping";
import { addRecipeLocal, recipeBatchesLocal } from "@/lib/shoppingStorage";

type Done = {
  added: number;
  servings: number;
  skippedHave: string[];
  where: "account" | "device";
  /** 1 for a first add; 2+ when added again on top of earlier batches. */
  batch: number;
};
type Notice =
  | { kind: "done"; done: Done }
  | { kind: "kept" }
  | { kind: "error"; text: string }
  | null;

const nameList = (names: string[]) => {
  const uniq = [...new Set(names)];
  return uniq.length <= 4 ? uniq.join(", ") : `${uniq.slice(0, 4).join(", ")} and ${uniq.length - 4} more`;
};

/**
 * "Add to shopping list" for the recipe page: the whole recipe at the servings
 * on screen. Staples are skipped unless the cook turns that off, and so is
 * anything in their fridge ("you already have: onion, garlic").
 *
 * Signed in, the server does it (add_recipe_to_shopping_list(): scaling and
 * skipping in the database). Signed out, the same rules run here on the
 * browser's own copy of the list. `selectForList` mirrors the SQL function.
 *
 * A recipe already on the list is never silently doubled or ignored: a dialog
 * asks "Add again (2 batches)" (quantities add up) or "Keep one" (no change).
 */
export function AddToShoppingList({
  slug,
  title,
  baseServings,
  servings,
  lines,
}: {
  slug: string;
  title: string;
  baseServings: number;
  servings: number;
  lines: RecipeLineInput[];
}) {
  const { status } = useAccount();
  const checkId = useId();
  const [skipStaples, setSkipStaples] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  /** Set when the recipe is already on the list: the dialog asks what to do. */
  const [onList, setOnList] = useState<{ batches: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  /** True once a dialog button was pressed, so closing it is not also reported as "kept". */
  const decided = useRef(false);

  // Same fridge the have/missing marks use.
  const { ids: fridgeIds } = useFridgeIds();
  const have = useMemo<ReadonlySet<number>>(() => fridgeIds ?? new Set(), [fridgeIds]);

  const staplesInRecipe = useMemo(() => lines.filter((l) => l.isStaple).length, [lines]);
  const preview = useMemo(
    () => selectForList(lines, baseServings, servings, { skipStaples, have }),
    [lines, baseServings, servings, skipStaples, have],
  );

  // A different serving count or toggle makes the last message stale.
  useEffect(() => setNotice(null), [servings, skipStaples]);

  // A native <dialog> shown with showModal() moves focus inside, traps it, makes the
  // page inert and closes on Escape. Closing it hands focus back to the Add button.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (onList && !d.open) {
      decided.current = false;
      d.showModal();
      keepRef.current?.focus(); // the harmless choice gets the focus; Enter does nothing to the list
    } else if (!onList && d.open) {
      d.close();
    }
  }, [onList]);

  /**
   * "ask": if the recipe is already on the list, stop and ask (nothing is written).
   * "again": add another batch on top, so quantities add up.
   */
  async function add(mode: "ask" | "again" = "ask", priorBatches = 0) {
    if (busy || status === "loading") return;
    setBusy(true);
    setNotice(null);
    const batch = mode === "again" ? priorBatches + 1 : 1;
    try {
      if (status === "in") {
        const r = await addToShoppingList({
          slug,
          servings,
          skipStaples,
          haveIds: [...have],
          mode,
        });
        if (r.ok) {
          setNotice({
            kind: "done",
            done: { added: r.added, servings, skippedHave: r.skippedHave, where: "account", batch },
          });
          return;
        }
        if (r.reason === "on-list") {
          setOnList({ batches: r.batches });
          return;
        }
        if (r.reason === "full") {
          setNotice({ kind: "error", text: "Your list is full (500 items). Clear some items first." });
          return;
        }
        if (r.reason !== "signed-out") {
          setNotice({ kind: "error", text: "Couldn't add to your list. Try again." });
          return;
        }
        // Session expired mid-visit: keep the cook's work on this device instead.
      }
      if (mode === "ask") {
        const batches = recipeBatchesLocal(
          slug,
          lines.flatMap((l) => (l.ingredientId == null ? [] : [l.ingredientId])),
        );
        if (batches > 0) {
          setOnList({ batches });
          return;
        }
      }
      const res = addRecipeLocal(preview, { slug, title }, { batch: mode === "again" });
      if (res.full) setNotice({ kind: "error", text: "Your list is full. Clear some items first." });
      else if (!res.ok) setNotice({ kind: "error", text: "This browser won't let Minced save a list. Log in to keep one." });
      else
        setNotice({
          kind: "done",
          done: { added: preview.add.length, servings, skippedHave: preview.skippedHave, where: "device", batch },
        });
    } catch {
      setNotice({ kind: "error", text: "Couldn't add to your list. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const batches = onList?.batches ?? 1;

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-band p-4 print:hidden">
      <Button onClick={() => add()} disabled={busy || status === "loading"} size="md" className="w-full">
        <ShoppingBasket aria-hidden />
        Add to shopping list
      </Button>

      {staplesInRecipe > 0 && (
        <div className="flex items-start gap-2.5">
          <input
            id={checkId}
            type="checkbox"
            checked={skipStaples}
            onChange={(e) => setSkipStaples(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-herb)]"
          />
          <label htmlFor={checkId} className="text-[0.8125rem] leading-snug text-ink-soft">
            Skip pantry staples{" "}
            <span className="text-ink-muted">
              ({staplesInRecipe} in this recipe)
            </span>
          </label>
        </div>
      )}

      {preview.skippedHave.length > 0 && (
        <p className="text-[0.8125rem] leading-snug text-ink-soft">
          <span className="font-mono font-semibold text-herb">You already have:</span>{" "}
          {nameList(preview.skippedHave)}. Left off the list.
        </p>
      )}

      <div role="status" aria-live="polite" className="empty:hidden">
        {notice?.kind === "done" && (
          <p className="flex items-start gap-2 text-[0.8125rem] leading-snug text-ink">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-herb" />
            <span className="min-w-0">
              {notice.done.added === 0
                ? "Nothing to add: everything is covered."
                : `Added ${notice.done.added} ${notice.done.added === 1 ? "item" : "items"} for ${notice.done.servings} ${notice.done.servings === 1 ? "serving" : "servings"}${notice.done.batch > 1 ? ` (batch ${notice.done.batch}, quantities added up)` : ""}.`}
              {notice.done.where === "device" && " Saved on this device."}
              {" "}
              <Link
                href="/shopping"
                className="inline-flex min-h-11 items-center font-semibold text-herb underline underline-offset-2"
              >
                View list
              </Link>
            </span>
          </p>
        )}
        {notice?.kind === "kept" && (
          <p className="flex items-start gap-2 text-[0.8125rem] leading-snug text-ink">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-herb" />
            <span className="min-w-0">
              Kept as is. Your list is unchanged.{" "}
              <Link
                href="/shopping"
                className="inline-flex min-h-11 items-center font-semibold text-herb underline underline-offset-2"
              >
                View list
              </Link>
            </span>
          </p>
        )}
        {notice?.kind === "error" && (
          <p className="text-[0.8125rem] text-paprika-deep">{notice.text}</p>
        )}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${checkId}-title`}
        aria-describedby={`${checkId}-desc`}
        // Escape and a click on the backdrop both mean cancel: the same as "Keep one".
        onClose={() => {
          if (!decided.current) setNotice({ kind: "kept" });
          setOnList(null);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(calc(100vw-2rem),26rem)] rounded-xl border border-line bg-surface p-5 text-ink shadow-sheet backdrop:bg-scrim"
      >
        <h2 id={`${checkId}-title`} className="text-[1.0625rem] leading-snug">
          {title} is already on your list
        </h2>
        <p id={`${checkId}-desc`} className="mt-2 text-[0.875rem] leading-snug text-ink-soft">
          {batches > 1 ? `It is there ${batches} times. ` : ""}
          Add it again and the quantities add up, as if you were cooking it {batches + 1} times.
          Or keep what is there.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            size="md"
            className="w-full sm:w-auto"
            onClick={() => {
              decided.current = true;
              dialogRef.current?.close();
              void add("again", batches);
            }}
          >
            Add again ({batches + 1} batches)
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="w-full sm:w-auto"
            ref={keepRef}
            onClick={() => dialogRef.current?.close()}
          >
            Keep one
          </Button>
        </div>
      </dialog>
    </div>
  );
}

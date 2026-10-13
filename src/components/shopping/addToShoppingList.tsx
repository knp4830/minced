"use client";

import { Check, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { Button } from "@/components/ui/button";
import { addToShoppingList } from "@/lib/actions/shopping";
import { fetchSavedFridge } from "@/lib/fridgeClient";
import { readFridge } from "@/lib/fridgeStorage";
import { selectForList, type RecipeLineInput } from "@/lib/shopping";
import { addRecipeLocal } from "@/lib/shoppingStorage";

/** `?pantry=1,2,3` from the fridge results link (same contract as the scaler's marks). */
function urlFridgeIds(): number[] {
  const raw = new URLSearchParams(window.location.search).get("pantry") ?? "";
  return raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

type Done = { added: number; servings: number; skippedHave: string[]; where: "account" | "device" };
type Notice = { kind: "done"; done: Done } | { kind: "error"; text: string } | null;

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
  const [have, setHave] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // The fridge is known from the link we arrived by and from this browser's saved fridge.
  // Signed in, the account's saved fridge is the truth (the local copy is emptied on
  // import), so it is added once the session is known.
  useEffect(() => {
    const ids = new Set<number>(urlFridgeIds());
    for (const f of readFridge()) ids.add(f.id);
    setHave(ids);
    if (status !== "in") return;
    let cancelled = false;
    void fetchSavedFridge().then((saved) => {
      if (cancelled || !saved) return;
      setHave(new Set([...ids, ...saved.items.map((i) => i.id), ...saved.coverIds]));
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const staplesInRecipe = useMemo(() => lines.filter((l) => l.isStaple).length, [lines]);
  const preview = useMemo(
    () => selectForList(lines, baseServings, servings, { skipStaples, have }),
    [lines, baseServings, servings, skipStaples, have],
  );

  // A different serving count or toggle makes the last message stale.
  useEffect(() => setNotice(null), [servings, skipStaples]);

  async function add() {
    if (busy || status === "loading") return;
    setBusy(true);
    setNotice(null);
    try {
      if (status === "in") {
        const r = await addToShoppingList({
          slug,
          servings,
          skipStaples,
          haveIds: [...have],
        });
        if (r.ok) {
          setNotice({
            kind: "done",
            done: { added: r.added, servings, skippedHave: r.skippedHave, where: "account" },
          });
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
      const res = addRecipeLocal(preview, { slug, title });
      if (res.full) setNotice({ kind: "error", text: "Your list is full. Clear some items first." });
      else if (!res.ok) setNotice({ kind: "error", text: "This browser won't let Minced save a list. Log in to keep one." });
      else
        setNotice({
          kind: "done",
          done: { added: preview.add.length, servings, skippedHave: preview.skippedHave, where: "device" },
        });
    } catch {
      setNotice({ kind: "error", text: "Couldn't add to your list. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-band p-4 print:hidden">
      <Button onClick={add} disabled={busy || status === "loading"} size="md" className="w-full">
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
                : `Added ${notice.done.added} ${notice.done.added === 1 ? "item" : "items"} for ${notice.done.servings} ${notice.done.servings === 1 ? "serving" : "servings"}.`}
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
        {notice?.kind === "error" && (
          <p className="text-[0.8125rem] text-paprika-deep">{notice.text}</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/accountProvider";
import { fetchSavedFridge } from "@/lib/fridgeClient";
import { displayQuantity } from "@/lib/scaling";

export type ScalerIngredient = {
  quantity: number | null;
  unit: string | null;
  name: string;
  prepNote: string | null;
  optional: boolean;
  ingredientId?: number | null;
  familyId?: number | null;
  isStaple?: boolean;
};

/** `?pantry=1,2,3` from the fridge results link, read after mount. */
function readFridgeIds(): number[] {
  const raw = new URLSearchParams(window.location.search).get("pantry") ?? "";
  return raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

const MIN = 1;
const MAX = 48;

/**
 * The ingredient list plus its servings stepper. This is the only client
 * component on the recipe page: it needs state (the chosen servings) and
 * nothing else does, so everything around it stays on the server and the page
 * stays cacheable.
 *
 * Scaling happens in `displayQuantity` from the ORIGINAL stored quantity every
 * time, never from the previously displayed value, so stepping 4 -> 5 -> 4
 * returns exactly the original text instead of accumulating rounding.
 */
export function ServingsScaler({
  baseServings,
  ingredients,
}: {
  baseServings: number;
  ingredients: ScalerIngredient[];
}) {
  const [servings, setServings] = useState(baseServings);

  // Opened from fridge results, the link carries the fridge. The page itself
  // stays static and cacheable, so the marks are applied here, after mount.
  // Opened without one (a bookmark, search), a signed-in visitor's SAVED fridge
  // stands in for it. The URL always wins, so a shared link shows its own marks.
  const { status } = useAccount();
  const [fridge, setFridge] = useState<ReadonlySet<number> | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  useEffect(() => {
    const ids = readFridgeIds();
    if (ids.length > 0) {
      setFridge(new Set(ids));
      setFromSaved(false);
      return;
    }
    if (status !== "in") return;
    let cancelled = false;
    void fetchSavedFridge().then((saved) => {
      if (cancelled || !saved || saved.items.length === 0) return;
      // coverIds already include each item's family (parent and variants).
      setFridge(new Set([...saved.items.map((i) => i.id), ...saved.coverIds]));
      setFromSaved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // A parent in the fridge covers its variants (same rule as match_recipes).
  const marks = ingredients.map((line) => {
    if (!fridge || line.isStaple) return null;
    const have =
      (line.ingredientId != null && fridge.has(line.ingredientId)) ||
      (line.familyId != null && fridge.has(line.familyId));
    return have ? "have" : "missing";
  });
  const needed = ingredients.filter((l, i) => marks[i] && !l.optional);
  const haveCount = needed.filter((l) => marks[ingredients.indexOf(l)] === "have").length;
  const changed = servings !== baseServings;

  const stepBtn =
    "inline-flex size-11 items-center justify-center bg-band text-herb transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-40 sm:size-9";

  return (
    <section aria-labelledby="ingredients-h">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="ingredients-h" className="text-[1.375rem]">
          Ingredients
        </h2>
        <div
          role="group"
          aria-label="Servings"
          className="flex items-center overflow-hidden rounded-md border border-line-strong"
        >
          <button
            type="button"
            className={stepBtn}
            onClick={() => setServings((s) => Math.max(MIN, s - 1))}
            disabled={servings <= MIN}
            aria-label="Fewer servings"
          >
            <Minus aria-hidden className="size-4" />
          </button>
          <output
            aria-live="polite"
            className="min-w-[4.25rem] text-center font-mono text-[0.8125rem] font-semibold"
          >
            {servings} {servings === 1 ? "serving" : "servings"}
          </output>
          <button
            type="button"
            className={stepBtn}
            onClick={() => setServings((s) => Math.min(MAX, s + 1))}
            disabled={servings >= MAX}
            aria-label="More servings"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {fridge && needed.length > 0 && (
        <p
          role="status"
          className="mb-2 rounded-md bg-band px-3 py-2 text-[0.8125rem] text-ink-muted"
        >
          <span className="font-mono font-semibold text-herb">
            You have {haveCount} of {needed.length}
          </span>
          {fromSaved && " from your fridge"}{" "}
          {haveCount === needed.length ? "· nothing missing" : "· the rest are marked below"}
        </p>
      )}

      <ul className="flex flex-col">
        {ingredients.map((line, i) => {
          const q = displayQuantity(line, baseServings, servings);
          return (
            <li
              key={i}
              className="flex items-baseline gap-3 border-b border-line py-2.5"
            >
              <span className="min-w-[4.75rem] shrink-0 font-mono text-[0.8125rem] font-semibold text-herb">
                {q.amount} {q.unit}
              </span>
              <span className="text-[0.9375rem] leading-snug">
                {line.name}
                {line.prepNote && (
                  <span className="text-ink-muted">, {line.prepNote}</span>
                )}
                {line.optional && (
                  <span className="text-ink-muted"> (optional)</span>
                )}
              </span>
              {marks[i] === "have" && (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[0.6875rem] text-herb">
                  <Check aria-hidden className="size-3.5" />
                  have
                </span>
              )}
              {marks[i] === "missing" && (
                <span className="ml-auto shrink-0 rounded-xs bg-paprika/10 px-1.5 py-0.5 font-mono text-[0.6875rem] text-paprika-deep">
                  missing
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex items-center gap-3 font-mono text-[0.6875rem] text-ink-subtle">
        <span>quantities scale with servings</span>
        {changed && (
          <button
            type="button"
            onClick={() => setServings(baseServings)}
            className="rounded-xs underline underline-offset-2 hover:text-herb"
          >
            reset to {baseServings}
          </button>
        )}
      </p>
    </section>
  );
}

"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useFridgeIds } from "@/lib/useFridgeIds";
import { AddToShoppingList } from "@/components/shopping/addToShoppingList";
import { useAccount } from "@/components/account/accountProvider";
import { displayQuantity, pluralizeName } from "@/lib/scaling";

export type ScalerIngredient = {
  quantity: number | null;
  unit: string | null;
  name: string;
  prepNote: string | null;
  optional: boolean;
  ingredientId?: number | null;
  familyId?: number | null;
  isStaple?: boolean;
  /** For the shopping list: aisle and how the unit converts. */
  aisle: string;
  unitKind: "mass" | "volume" | "count" | null;
  unitFactor: number | null;
};

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
  recipe,
}: {
  baseServings: number;
  ingredients: ScalerIngredient[];
  recipe: { slug: string; title: string };
}) {
  const [servings, setServings] = useState(baseServings);

  // The fridge behind the have/missing marks: link, this browser, or the account (one hook,
  // shared with the shopping box so both agree).
  // A signed-out visitor with only leftovers in this browser's storage sees NO marks: nothing
  // here should read as "you are missing things" unless they just told us what they have
  // (the link from a fridge search) or they are signed in with a saved fridge.
  const { status } = useAccount();
  const { ids: pickedFridge, fromSaved } = useFridgeIds();
  const fridge = pickedFridge && (!fromSaved || status === "in") ? pickedFridge : null;

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
  // Which lines are assumed, named from this recipe's own lines (the database holds the list).
  const stapleNames = [
    ...new Set(ingredients.filter((l) => l.isStaple).map((l) => l.name.toLowerCase())),
  ];
  const stapleList =
    stapleNames.length <= 1
      ? (stapleNames[0] ?? "")
      : `${stapleNames.slice(0, -1).join(", ")} and ${stapleNames[stapleNames.length - 1]}`;
  const assumed =
    stapleNames.length === 0
      ? null
      : `We assume you already have ${stapleList} (basic pantry staples), so ${
          stapleNames.length === 1 ? "it isn't" : "they aren't"
        } counted in this tally.`;
  const changed = servings !== baseServings;

  // Prep notes are shown as written. Numbers inside them ("use 4-6 cloves", package sizes)
  // are never scaled; a bare "optional" on a line already marked (optional) would say it twice.
  const notes = ingredients.map((line) => {
    if (!line.prepNote) return null;
    const text = line.optional
      ? line.prepNote
          .split(/,\s*/)
          .filter((seg) => seg.trim().toLowerCase() !== "optional")
          .join(", ")
      : line.prepNote;
    return text || null;
  });

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
            className="min-w-[6.75rem] px-3 text-center font-mono text-[0.8125rem] font-semibold whitespace-nowrap"
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
          {assumed && <span className="block pt-0.5">{assumed}</span>}
        </p>
      )}

      <ul className="flex flex-col">
        {ingredients.map((line, i) => {
          const q = displayQuantity(line, baseServings, servings);
          const shownName = q.unit ? line.name : pluralizeName(line.name, q.amount);
          return (
            <li
              key={i}
              className="flex items-baseline gap-3 border-b border-line py-2.5"
            >
              <span className="min-w-[4.75rem] shrink-0 font-mono text-[0.8125rem] font-semibold text-herb">
                {q.approx && (
                  <>
                    <span aria-hidden>~</span>
                    <span className="sr-only">about </span>
                  </>
                )}
                {q.amount} {q.unit}
              </span>
              <span className="text-[0.9375rem] leading-snug">
                {shownName}
                {notes[i] && <span className="text-ink-muted">, {notes[i]}</span>}
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

      <AddToShoppingList
        slug={recipe.slug}
        title={recipe.title}
        baseServings={baseServings}
        servings={servings}
        lines={ingredients}
      />

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

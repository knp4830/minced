"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { displayQuantity } from "@/lib/scaling";

export type ScalerIngredient = {
  quantity: number | null;
  unit: string | null;
  name: string;
  prepNote: string | null;
  optional: boolean;
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
}: {
  baseServings: number;
  ingredients: ScalerIngredient[];
}) {
  const [servings, setServings] = useState(baseServings);
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

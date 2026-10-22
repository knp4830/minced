"use client";

import { useEffect, useRef, useState } from "react";

import { previewRecipeNutrition } from "@/lib/actions/myRecipes";
import type { NutritionPreview as Preview, PreviewMacro } from "@/lib/queries/myRecipes";
import type { IngredientRow } from "@/lib/recipeForm";

/*
 * The live nutrition estimate in the recipe form (Section 07).
 *
 * Asks the server after the person pauses typing (never per keystroke), using the same database functions that
 * work out a published recipe's label, so what they see here is what the recipe page will say. Nothing typed in,
 * nothing guessed: a line we cannot count is named, and every number then reads "at least".
 *
 * The last good numbers stay on screen while a new answer is on its way (dimmed, not blanked), so the figures do
 * not flicker on every edit. The result sits in a polite live region, so a screen reader hears it once it settles.
 */

const DEBOUNCE_MS = 700;

const LABELS: Record<PreviewMacro["key"], string> = {
  energy_kcal: "Calories",
  protein_g: "Protein",
  carbs_g: "Carbs",
  fat_g: "Fat",
};
const ORDER: PreviewMacro["key"][] = ["energy_kcal", "protein_g", "carbs_g", "fat_g"];

function amountText(m: PreviewMacro): string {
  if (m.key === "energy_kcal") return `${Math.round(m.amount)} kcal`;
  return `${m.amount < 10 ? (Math.round(m.amount * 10) / 10).toString() : Math.round(m.amount)} g`;
}

type State =
  | { kind: "idle" }
  | { kind: "ok"; preview: Preview }
  | { kind: "servings" }
  | { kind: "failed" };

export function NutritionPreview({ rows, servings }: { rows: IngredientRow[]; servings: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Only what changes the numbers: the five fields of each named row, and the servings.
  const wire = rows
    .filter((r) => r.name.trim() !== "")
    .map((r) => ({
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      note: r.note,
      optional: r.optional,
      fdcId: typeof r.fdcId === "number" ? r.fdcId : null,
    }));
  const key = JSON.stringify([wire, servings.trim()]);

  useEffect(() => {
    const mine = ++seq.current;
    const [lines, sv] = JSON.parse(key) as [typeof wire, string];
    if (lines.length === 0) {
      setState({ kind: "idle" });
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      let result: Awaited<ReturnType<typeof previewRecipeNutrition>> | null = null;
      try {
        result = await previewRecipeNutrition(lines, sv);
      } catch {
        result = null;
      }
      if (mine !== seq.current) return; // a newer edit has already asked again
      setBusy(false);
      if (result === null || ("error" in result && result.error !== "servings")) setState({ kind: "failed" });
      else if ("error" in result) setState({ kind: "servings" });
      else setState({ kind: "ok", preview: result });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key]);

  const p = state.kind === "ok" ? state.preview : null;
  const macros = p ? ORDER.flatMap((k) => p.macros.filter((m) => m.key === k)) : [];
  const anyAtLeast = macros.some((m) => m.atLeast);

  return (
    <div className="rounded-xl border border-line bg-band px-4 py-4">
      <div role="status" aria-live="polite" aria-busy={busy}>
        <dl className={`grid grid-cols-2 gap-3 font-mono transition-opacity sm:grid-cols-4 ${busy ? "opacity-60" : ""}`}>
          {ORDER.map((k) => {
            const m = macros.find((x) => x.key === k);
            return (
              <div key={k}>
                <dt className="label-mono">{LABELS[k]}</dt>
                <dd className={`mt-1 text-lg ${m ? "text-ink" : "text-ink-subtle"}`}>
                  {m ? (
                    <>
                      {m.atLeast && <span className="text-[0.8125rem] font-normal text-ink-muted">at least </span>}
                      {amountText(m)}
                    </>
                  ) : (
                    <span aria-label="not available yet">&mdash;</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
          {state.kind === "idle" &&
            "Add your ingredients and the numbers will appear here, per serving. They come from your ingredients, so there is nothing to type in."}
          {state.kind === "servings" && "Tell us how many servings this makes and we will work out the numbers per serving."}
          {state.kind === "failed" && "We could not check this just now. Your recipe is safe; the numbers will come back when you next edit."}
          {p && p.status === "complete" && "Per serving, estimated from USDA data before cooking losses. The recipe page works it out the same way."}
          {p && p.status === "partial" &&
            "Per serving. We could not count everything below, so the real numbers are these or higher."}
          {p && p.status === "unavailable" &&
            "We cannot give a number yet. Too few of these ingredients have nutrition data we can use."}
          {busy && state.kind !== "idle" && <span className="sr-only"> Updating.</span>}
        </p>

        {p && p.uncounted.length > 0 && (
          <div className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            <p className="font-semibold text-ink">{anyAtLeast || p.status === "unavailable" ? "Not counted" : "Left out of the numbers"}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {p.uncounted.slice(0, 12).map((u) => (
                <li key={`${u.name}|${u.reason}`}>
                  {u.name} <span className="text-ink-subtle">({u.reason})</span>
                </li>
              ))}
            </ul>
            {p.uncounted.length > 12 && <p className="mt-1">and {p.uncounted.length - 12} more.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

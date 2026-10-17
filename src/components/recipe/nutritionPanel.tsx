import { ChevronDown } from "lucide-react";

import { FDC } from "@/lib/nutrients";
import type { Nutrient } from "@/lib/nutrients";
import type { RecipeNutrients } from "@/lib/queries/recipeNutrients";
import { buildLabel, sodiumIsMinimum, uncountedLines, type Columns, type LabelRow } from "@/lib/recipeLabel";
import { cn } from "@/lib/utils";

/*
 * Recipe page nutrition: four headline numbers, then a "More nutrition" Nutrition Facts-style label with
 * every nutrient we can honestly state, % Daily Value, an "at least" marker where the recipe is only
 * partly counted, and the ingredients that were not counted. A server component: it renders into the ISR
 * page and ships no JavaScript.
 *
 * Works before any nutrient data exists: with `data` null it shows exactly the six published columns the
 * page showed before this component existed.
 */

const MAX_UNCOUNTED = 8;

export function NutritionPanel({
  columns,
  data,
  nutrients,
  lines,
}: {
  columns: Columns;
  data: RecipeNutrients | null;
  nutrients: Nutrient[];
  lines: { name: string; quantity: number | null; optional: boolean }[];
}) {
  const m = buildLabel(columns, data, nutrients);
  const pick = (fdc: number) => m.top.find((r) => r.fdc === fdc);
  const protein = pick(FDC.protein);
  const carbs = pick(FDC.carbs);
  const fat = pick(FDC.fat);

  const tiles = [
    m.calories ? { label: "Calories", text: m.calories.text, atLeast: m.calories.atLeast } : null,
    protein?.amount != null ? { label: "Protein", text: protein.amountText, atLeast: protein.atLeast } : null,
    carbs?.amount != null ? { label: "Carbs", text: carbs.amountText, atLeast: carbs.atLeast } : null,
    fat?.amount != null ? { label: "Fat", text: fat.amountText, atLeast: fat.atLeast } : null,
  ].filter((t): t is { label: string; text: string; atLeast: boolean } => t !== null);

  if (tiles.length === 0 && m.top.length === 0) return null;

  const uncounted = data ? uncountedLines(lines, data.gaps) : [];
  const shownUncounted = uncounted.slice(0, MAX_UNCOUNTED);
  const sodiumMin = data && !m.unavailable && sodiumIsMinimum(lines);

  const basisNote =
    m.basis === "published+computed"
      ? "Calories, fat, carbohydrate, fiber, sodium and protein are as published by USDA MyPlate. The other values are estimated from USDA FoodData Central ingredient data, before cooking losses."
      : m.basis === "computed"
        ? "Estimated from USDA FoodData Central ingredient data, before cooking losses."
        : "Amounts are estimated from USDA data.";

  return (
    <section aria-labelledby="nutrition-h" className="rounded-xl border border-line bg-band p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="nutrition-h" className="label-mono">
          Nutrition per serving
        </h2>
        <p className="font-mono text-[0.6875rem] text-ink-subtle">estimate · USDA data</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 min-[420px]:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0">
            <dt className="text-[0.75rem] text-ink-muted">{t.label}</dt>
            <dd className="font-mono text-[1.0625rem] font-semibold">
              {t.atLeast ? <AtLeast /> : "~"}
              {t.text}
            </dd>
          </div>
        ))}
      </dl>
      {m.partial && tiles.some((t) => t.atLeast) && (
        <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">
          At least: {uncounted.some((u) => u.reason === "no data") ? "some ingredients have no nutrition data yet" : "not every ingredient could be counted"}, so the real numbers are this or higher.
        </p>
      )}

      {(m.top.length > 0 || m.calories) && (
        <details className="group mt-3 border-t border-line pt-2.5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xs text-[0.8125rem] font-semibold text-herb focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span>More nutrition</span>
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          {/* Nutrition-label layout: a heavy rule above, hairlines between rows. */}
          <div className="mt-1 max-w-[24rem] rounded-md border border-ink bg-surface px-3 pt-2 pb-2.5 text-ink">
            <p className="text-[1.125rem] font-extrabold tracking-tight">Nutrition facts</p>
            <p className="text-[0.75rem] text-ink-muted">Per serving, estimated</p>
            {m.calories && (
              <div className="mt-1 flex items-baseline justify-between border-t-[6px] border-ink pt-1">
                <span className="text-[0.9375rem] font-bold">Calories</span>
                <span className="font-mono text-[1.5rem] leading-none font-bold">
                  {m.calories.atLeast && <AtLeast />}
                  {m.calories.text}
                </span>
              </div>
            )}
            <p className="mt-1 border-t border-ink pt-1 text-right text-[0.6875rem] font-bold">% Daily value*</p>
            <dl>
              {m.top.map((r) => (
                <LabelLine key={`${r.fdc}-${r.name}`} r={r} />
              ))}
            </dl>
            {m.micro.length > 0 && (
              <>
                <p className="mt-1 border-t-[6px] border-ink pt-1 text-[0.8125rem] font-bold">Vitamins and minerals</p>
                <dl>
                  {m.micro.map((r) => (
                    <LabelLine key={`${r.fdc}-${r.name}`} r={r} />
                  ))}
                </dl>
              </>
            )}
            <div className="mt-1.5 space-y-1 border-t-[6px] border-ink pt-1.5 text-[0.6875rem] leading-snug text-ink-muted">
              <p>*Percent daily values use the FDA reference diet of 2,000 calories. {basisNote}</p>
              {m.micro.some((r) => r.noData) && <p>&ldquo;Not enough data&rdquo; means too few of the ingredients report that nutrient to give a fair number.</p>}
              {m.top.some((r) => r.estimated) && <p>Added sugars are estimated from the sweeteners and sweetened foods in the ingredient list.</p>}
              {sodiumMin && <p>Sodium is a minimum: salt and salty sauces listed &ldquo;to taste&rdquo; are not counted.</p>}
              {shownUncounted.length > 0 && (
                <p>
                  Not counted:{" "}
                  {shownUncounted.map((u, i) => (
                    <span key={`${u.name}-${u.reason}`}>
                      {i > 0 && ", "}
                      {u.name} ({u.reason === "no data" ? "no nutrition data" : u.reason})
                    </span>
                  ))}
                  {uncounted.length > shownUncounted.length ? ` and ${uncounted.length - shownUncounted.length} more` : ""}.
                </p>
              )}
              <p>Source: U.S. Department of Agriculture, FoodData Central. Not medical advice.</p>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}

function AtLeast() {
  return (
    <>
      <span aria-hidden>≥</span>
      <span className="sr-only">at least </span>
    </>
  );
}

function LabelLine({ r }: { r: LabelRow }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line-strong py-1 text-[0.8125rem]">
      <dt className={cn(r.indent === 1 && "pl-4", r.indent === 2 && "pl-8", r.bold && "font-bold")}>
        {r.name}{" "}
        {r.noData ? (
          <span className="font-normal text-ink-muted">not enough data</span>
        ) : (
          <span className="font-normal">
            {r.atLeast && <AtLeast />}
            {r.amountText}
          </span>
        )}
      </dt>
      <dd className="font-mono font-bold">{r.pct !== null && !r.noData ? `${r.pct}%` : ""}</dd>
    </div>
  );
}

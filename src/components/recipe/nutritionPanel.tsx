import { ChevronDown } from "lucide-react";

import { FDC } from "@/lib/nutrients";
import type { Nutrient } from "@/lib/nutrients";
import type { RecipeNutrients } from "@/lib/queries/recipeNutrients";
import { buildLabel, sodiumIsMinimum, uncountedLines, uncountedText, type Columns, type LabelRow } from "@/lib/recipeLabel";
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

  const uncounted = data ? uncountedLines(lines, data.gaps) : [];
  const gapNames = uncounted.filter((u) => u.reason === "no data").map((u) => u.name.replace(/ \(.*\)$/, ""));
  // An unavailable recipe says why, instead of silently having no nutrition section.
  const unavailableNote = m.unavailable
    ? `Nutrition is not available for this recipe yet: ${
        gapNames.length > 0
          ? `we have no usable nutrition data for ${gapNames.slice(0, 3).join(", ")}${gapNames.length > 3 ? ` and ${gapNames.length - 3} more` : ""}.`
          : "too few of its ingredients have nutrition data to add up."
      }`
    : null;

  if (tiles.length === 0 && m.top.length === 0) {
    if (!unavailableNote) return null;
    return (
      <section aria-labelledby="nutrition-h" className="rounded-xl border border-line bg-band p-4">
        <h2 id="nutrition-h" className="label-mono">
          Nutrition per serving
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-snug text-ink-muted">{unavailableNote}</p>
      </section>
    );
  }

  const shownUncounted = uncounted.slice(0, MAX_UNCOUNTED);
  const sodiumMin = data && !m.unavailable && sodiumIsMinimum(lines);

  // Worded from what the label really holds: MyPlate is credited only for recipes the database says are MyPlate imports.
  const myplate = m.publishedBy === "usda_myplate";
  const publishedName = myplate ? "as published by USDA MyPlate" : "as published with the recipe";
  const basisNote =
    m.basis === "published+computed"
      ? `Calories, fat, carbohydrate, fiber, sodium and protein are ${publishedName}. The other values are estimated from USDA FoodData Central ingredient data, before cooking losses.`
      : m.basis === "computed"
        ? "Estimated from USDA FoodData Central ingredient data, before cooking losses."
        : m.basis === "published"
          ? `Values are ${publishedName}.`
          : "Amounts are estimated from USDA data.";
  const anyAtLeast = m.partial && (m.calories?.atLeast || m.top.some((r) => r.atLeast) || m.micro.some((r) => r.atLeast));
  const disagreePct = m.disagreement === null ? null : Math.round(Math.abs(m.disagreement) * 100);

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

      {disagreePct !== null && m.disagreement !== null && (
        <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">
          The ingredient list adds up to about {disagreePct}% {m.disagreement > 0 ? "more" : "fewer"} calories than USDA&rsquo;s published figure shown here, so treat these numbers as a rough guide.
        </p>
      )}
      {unavailableNote && <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">{unavailableNote}</p>}

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
              {anyAtLeast && <p>&ldquo;At least&rdquo; (&ge;) means some ingredients have no nutrition data and could not be counted, so the real amount is this or higher.</p>}
              {(data?.assumptions ?? []).map((a) => (
                <p key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}.</p>
              ))}
              {(data?.nationalSources ?? []).includes("cofid") && (
                <p>Some values: McCance and Widdowson&rsquo;s Composition of Foods Integrated Dataset 2021, Public Health England. Contains public sector information licensed under the Open Government Licence v3.0.</p>
              )}
              {(data?.nationalSources ?? []).includes("cnf") && (
                <p>Some values: Canadian Nutrient File 2026, Health Canada. Contains information licensed under the Open Government Licence - Canada.</p>
              )}
              {m.breakdownHidden && <p>A fat or sugar breakdown is left out where the ingredient list does not fit inside USDA&rsquo;s published total.</p>}
              {(m.micro.some((r) => r.noData) || m.top.some((r) => r.noData)) && <p>&ldquo;Not enough data&rdquo; means too few of the ingredients report that nutrient to give a fair number.</p>}
              {m.top.some((r) => r.estimated) && <p>Added sugars are estimated from the sweeteners and sweetened foods in the ingredient list.</p>}
              {sodiumMin && <p>Sodium is a minimum: salt and salty sauces listed &ldquo;to taste&rdquo; are not counted.</p>}
              {m.disagreement !== null && (
                <p>
                  The vitamins and minerals are computed from the ingredient list, which comes out about {Math.round(Math.abs(m.disagreement) * 100)}% {m.disagreement > 0 ? "higher" : "lower"} in calories than the published figure, so they may not match the calories shown.
                </p>
              )}
              {shownUncounted.length > 0 && (
                <p>
                  Not counted:{" "}
                  {shownUncounted.map((u, i) => (
                    <span key={`${u.name}-${u.reason}`}>
                      {i > 0 && ", "}
                      {uncountedText(u)}
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

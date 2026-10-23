import { PhoneCollapse } from "@/components/me/phoneCollapse";
import { personalDailyValues, type Dri, type Person } from "@/lib/me/dailyValues";
import { dayNutrientLines, type NutrientLine } from "@/lib/me/nutrientTotals";
import type { FoodEntry } from "@/lib/me/types";
import { roundForLabel, type Nutrient } from "@/lib/nutrients";
import { cn } from "@/lib/utils";

/*
 * "All nutrients today": every nutrient in the `nutrients` table with what the day's logged meals add up
 * to, a bar and its % of the FDA Daily Value (the table is the single source of both; see
 * src/lib/me/nutrientTotals.ts for the rules). A nutrient with a daily limit (sodium, fat, saturated fat,
 * cholesterol, added sugars) turns paprika once it passes 100%.
 *
 * Missing is not zero: a nutrient no logged entry reports shows a dash, and one that only some entries
 * report shows "at least" with a note, because the true total is higher.
 */

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function NutrientsPanel({ entries, nutrients, dris, person, isToday = true }: { entries: FoodEntry[]; nutrients: Nutrient[]; dris: Dri[]; person: Person; isToday?: boolean }) {
  const empty = entries.length === 0;
  const dvs = personalDailyValues(nutrients, dris, person);
  const lines = empty ? [] : dayNutrientLines(entries, nutrients, dvs);
  const sections = [
    { id: "top", title: "Main nutrients", rows: lines.filter((l) => l.group === "top") },
    { id: "micro", title: "Vitamins and minerals", rows: lines.filter((l) => l.group === "micro") },
  ].filter((g) => g.rows.length > 0);
  const personalMode = person.sex !== null && person.age !== null;
  const fromBaseline = person.macros?.source === "baseline";
  const partial = lines.filter((l) => l.partial);
  const noData = lines.filter((l) => l.amount === null);

  return (
    <section aria-labelledby="me-nutrients-h" className="@container rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-mono">From logged meals</p>
          <h2 id="me-nutrients-h" className="mt-1.5 text-xl leading-tight font-medium">
            {isToday ? "All nutrients today" : "All nutrients that day"}
          </h2>
        </div>
        <span className="hidden pt-1 font-mono text-[0.6875rem] text-ink-muted sm:block">
          bar = % of daily value &middot; <span className="text-paprika-deep">over limit</span>
        </span>
      </div>

      {empty ? (
        <p className="mt-4 text-[0.875rem] text-ink-muted">Nutrients from your meals will be listed here once you&rsquo;ve logged something.</p>
      ) : (
        <PhoneCollapse label="All nutrients">
          {sections.map((g) => (
            <div key={g.id} className="mt-3">
              <h3 className="label-mono">{g.title}</h3>
              <ul className="mt-1 @xl:columns-2 @xl:gap-x-9">
                {g.rows.map((n) => (
                  <Line key={n.id} n={n} />
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            {personalMode
              ? `% of daily value is personal. Protein, carbohydrate and fat use ${fromBaseline ? "an estimate from your weight, sex and age (sedentary)" : "your daily targets"}; saturated fat and added sugars are 10% of your calories (Dietary Guidelines for Americans); fiber, vitamins and minerals are the Dietary Reference Intakes for your sex and age (National Academies, RDA or Adequate Intake), and sodium uses the National Academies upper reference of 2,300 mg (1,800 mg under 14). Cholesterol uses the FDA value. Not adjusted for pregnancy, breastfeeding or smoking.`
              : "% of daily value is the FDA label reference for a 2,000-calorie adult diet. Add your sex and set your targets to see values for you."}
            {partial.length > 0 ? ` An “at least” number means some of what you logged does not report that nutrient (quick adds only record calories, protein, carbs, fat, fiber and sodium).` : ""}
            {noData.length > 0 ? ` A dash means nothing you logged reports it. That is unknown, not zero.` : ""}
            {" "}Nutrient data: USDA FoodData Central. Not medical advice.
          </p>
        </PhoneCollapse>
      )}
    </section>
  );
}

function Line({ n }: { n: NutrientLine }) {
  const none = n.amount === null;
  return (
    <li className="grid h-11 break-inside-avoid grid-cols-[minmax(0,1fr)_auto_3.5rem_2.5rem] items-center gap-x-2.5 border-b border-line sm:h-8 sm:grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_2.5rem]">
      <span className={cn("truncate text-[0.8125rem]", n.indent === 1 && "pl-4", n.indent === 2 && "pl-8")} title={n.dv !== null ? `Daily value ${nf.format(n.dv)} ${n.unit}` : undefined}>{n.name}</span>
      <span className={cn("text-right font-mono text-xs", n.over && "text-paprika-deep", none && "text-ink-subtle")}>
        {none ? (
          <>
            <span aria-hidden>&ndash;</span>
            <span className="sr-only">no data logged</span>
          </>
        ) : (
          <>
            {n.partial && (
              <span role="img" aria-label="at least">
                &ge;{" "}
              </span>
            )}
            {nf.format(roundForLabel(n.amount as number, { unit: n.unit, fdcNumber: null }))} {n.unit}
          </>
        )}
      </span>
      <span className="block h-1 overflow-hidden rounded-xs bg-band" aria-hidden>
        <span className={cn("block h-full", n.over ? "bg-paprika" : "bg-herb")} style={{ width: `${Math.min(n.pct ?? 0, 100)}%` }} />
      </span>
      <span className={cn("text-right font-mono text-[0.6875rem]", n.over ? "text-paprika-deep" : "text-ink-muted")}>
        {n.pct !== null ? (
          <>
            {n.pct}%<span className="sr-only"> of daily value{n.dv !== null ? ` of ${nf.format(n.dv)} ${n.unit}` : ""}{n.over ? ", over the limit" : ""}</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

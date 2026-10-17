import { PhoneCollapse } from "@/components/me/phoneCollapse";
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

export function NutrientsPanel({ entries, nutrients }: { entries: FoodEntry[]; nutrients: Nutrient[] }) {
  const empty = entries.length === 0;
  const lines = empty ? [] : dayNutrientLines(entries, nutrients);
  const half = Math.ceil(lines.length / 2);
  const columns = [lines.slice(0, half), lines.slice(half)];
  const partial = lines.filter((l) => l.partial);
  const noData = lines.filter((l) => l.amount === null);

  return (
    <section aria-labelledby="me-nutrients-h" className="@container rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-mono">From logged meals</p>
          <h2 id="me-nutrients-h" className="mt-1.5 text-xl leading-tight font-medium">
            All nutrients today
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
          <div className="mt-2.5 grid gap-x-9 @xl:grid-cols-2">
            {columns.map((col, i) => (
              <ul key={i}>
                {col.map((n) => (
                  <Line key={n.id} n={n} />
                ))}
              </ul>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            % Daily Value is the FDA label reference for a 2,000-calorie adult diet, not a personal goal.
            {partial.length > 0 ? ` A “at least” number means some of what you logged does not report that nutrient (quick adds only record calories, protein, carbs, fat, fiber and sodium).` : ""}
            {noData.length > 0 ? ` A dash means nothing you logged reports it. That is unknown, not zero.` : ""}
          </p>
        </PhoneCollapse>
      )}
    </section>
  );
}

function Line({ n }: { n: NutrientLine }) {
  const none = n.amount === null;
  return (
    <li className="grid h-11 grid-cols-[minmax(0,1fr)_auto_3.5rem_2.5rem] items-center gap-x-2.5 border-b border-line sm:h-8 sm:grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_2.5rem]">
      <span className="truncate text-[0.8125rem]">{n.name}</span>
      <span className={cn("text-right font-mono text-xs", n.over && "text-paprika-deep", none && "text-ink-subtle")}>
        {none ? (
          <>
            <span aria-hidden>&ndash;</span>
            <span className="sr-only">no data logged</span>
          </>
        ) : (
          <>
            {n.partial && (
              <>
                <span aria-hidden>&ge;</span>
                <span className="sr-only">at least </span>
              </>
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
            {n.pct}%<span className="sr-only"> of daily value{n.over ? ", over the limit" : ""}</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

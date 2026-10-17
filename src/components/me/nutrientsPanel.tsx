import { PhoneCollapse } from "@/components/me/phoneCollapse";
import { nutrientLines } from "@/lib/me/dv";
import type { DayTotals, FoodEntry } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * "All nutrients today": each nutrient with an amount, a bar and its % of the FDA Daily Value (reference
 * table and source in src/lib/me/dv.ts). A nutrient with a daily limit (sodium, fat) turns paprika once it
 * passes 100%. Only nutrients that Minced stores for recipes appear: calories, protein, carbs, fat, fiber
 * and sodium. Vitamins and minerals are not invented; the panel says so.
 */

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export function NutrientsPanel({ totals, entries }: { totals: DayTotals; entries: FoodEntry[] }) {
  const empty = entries.length === 0;
  const lines = empty
    ? []
    : nutrientLines({ fat: totals.fatG, carbs: totals.carbsG, fiber: totals.fiberG, protein: totals.proteinG, sodium: totals.sodiumMg });
  const half = Math.ceil(lines.length / 2);
  const columns = [lines.slice(0, half), lines.slice(half)];
  const unknown = entries.some((e) => e.fiberG === null || e.sodiumMg === null);

  return (
    <section aria-labelledby="me-nutrients-h" className="rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]">
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
          <div className="mt-2.5 grid gap-x-9 md:grid-cols-2">
            {columns.map((col, i) => (
              <ul key={i}>
                {col.map((n) => (
                  <li key={n.id} className="grid h-11 grid-cols-[1fr_auto_4rem_2.5rem] items-center gap-x-2.5 border-b border-line sm:h-8 sm:grid-cols-[1fr_4.875rem_4rem_2.5rem]">
                    <span className="truncate text-[0.8125rem]">{n.name}</span>
                    <span className={cn("text-right font-mono text-xs", n.over && "text-paprika-deep")}>
                      {nf.format(n.amount)} {n.unit}
                    </span>
                    <span className="block h-1 overflow-hidden rounded-xs bg-band" aria-hidden>
                      <span className={cn("block h-full", n.over ? "bg-paprika" : "bg-herb")} style={{ width: `${Math.min(n.pct, 100)}%` }} />
                    </span>
                    <span className={cn("text-right font-mono text-[0.6875rem]", n.over ? "text-paprika-deep" : "text-ink-muted")}>
                      {n.pct}%<span className="sr-only"> of daily value{n.over ? ", over the limit" : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            % Daily Value is the FDA label reference for a 2,000-calorie diet, not a personal goal.
            {unknown ? " Quick adds without fiber or sodium count as zero for those two." : ""} Vitamins and minerals are not tracked yet, because recipes here store calories, protein, carbs, fat, fiber and sodium.
          </p>
        </PhoneCollapse>
      )}
    </section>
  );
}

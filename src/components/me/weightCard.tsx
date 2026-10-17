import Link from "next/link";

import { TargetsButton } from "@/components/me/meButtons";
import { WeightChart } from "@/components/me/weightChart";
import { WeightLogForm } from "@/components/me/weightLogForm";
import { addDays, dayMonthYear, weekRange, weekSpanWords, type WeekStart } from "@/lib/me/dates";
import { daysToGoal, effectivePaceKg, formatWeight, kgToLb1, round1, type Units } from "@/lib/me/targets";
import type { MeTargets } from "@/lib/me/types";
import { averageOn, changeVsWeekAgo, toGoal, weeklyAverages, withRollingAverage, type WeightPoint } from "@/lib/me/weight";
import { cn } from "@/lib/utils";

/*
 * The Weight card: the 7-day average (the number to watch, because a single reading jumps around with water
 * and timing), the change from a week ago, the distance to the goal weight, and a chart. The range is in the
 * URL (?wr=30|90|weekly) so it is shareable and survives a refresh.
 */

export type WeightRange = "30" | "90" | "weekly";
export const WEIGHT_RANGES: { v: WeightRange; label: string }[] = [
  { v: "30", label: "30 days" },
  { v: "90", label: "90 days" },
  { v: "weekly", label: "Weekly" },
];
/** How far back the page fetches: 26 weeks for the weekly view plus a week of history for the first averages. */
export const WEIGHT_FETCH_DAYS = 190;

const diffText = (kg: number, units: Units) => (units === "imperial" ? `${kgToLb1(Math.abs(kg)).toFixed(1)} lb` : `${round1(Math.abs(kg)).toFixed(1)} kg`);

export function WeightCard({
  weights,
  today,
  range,
  hrefs,
  targets,
  units: unitsSetting,
  weekStart = "monday",
}: {
  /** Settings > Units. Falls back to the targets' copy, then metric. */
  units?: Units;
  /** Settings > Week starts on. */
  weekStart?: WeekStart;
  weights: WeightPoint[];
  today: string;
  range: WeightRange;
  hrefs: Record<WeightRange, string>;
  targets: MeTargets | null;
}) {
  const units: Units = unitsSetting ?? targets?.units ?? "metric";
  const avg = averageOn(weights, today);
  const change = changeVsWeekAgo(weights, today);
  const todays = weights.find((w) => w.date === today)?.kg ?? null;

  const days = range === "30" ? 30 : 90;
  const from = range === "weekly" ? weekRange(addDays(today, -175), weekStart).from : addDays(today, -(days - 1));
  const daily = withRollingAverage(weights).filter((p) => p.date >= from);
  const weekly = weeklyAverages(weights.filter((p) => p.date >= from), weekStart);
  const hasData = range === "weekly" ? weekly.length > 0 : daily.length > 0;

  // Goal: distance from the current average (or the latest reading when there is no average yet).
  const here = avg ?? weights[weights.length - 1]?.kg ?? null;
  const losingOrGaining = targets !== null && targets.goal !== "maintain";
  const goalKg = losingOrGaining ? targets.goalWeightKg : null;
  const toGo = here !== null && goalKg !== null && targets && targets.goal !== "maintain" ? toGoal(here, goalKg, targets.goal) : null;
  const eta = here !== null && goalKg !== null && targets ? daysToGoal(here, goalKg, targets.goal, effectivePaceKg({ sex: targets.sex, age: targets.age, heightCm: targets.heightCm, weightKg: targets.weightKg, activity: targets.activity, goal: targets.goal, paceKg: targets.paceKg }, targets.kcal)) : null;

  const summaryBits = [
    avg !== null ? `7-day average ${formatWeight(avg, units)}.` : "No 7-day average yet.",
    change !== null ? `${change === 0 ? "No change" : `${change < 0 ? "Down" : "Up"} ${diffText(change, units)}`} from a week ago.` : "",
    goalKg !== null ? `Goal weight ${formatWeight(goalKg, units)}.` : "",
  ];
  const label = range === "weekly" ? "Weekly average weight, last 26 weeks" : `Weight, last ${days} days`;

  return (
    <section aria-labelledby="me-weight-h" className="rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="label-mono">7-day average</p>
          <h2 id="me-weight-h" className="mt-1.5 text-xl leading-tight font-medium">
            Weight
          </h2>
        </div>
        <nav aria-label="Weight chart range" className="inline-flex rounded-md border border-line-strong p-0.5">
          {WEIGHT_RANGES.map((r) => (
            <Link
              key={r.v}
              href={hrefs[r.v]}
              scroll={false}
              aria-current={range === r.v ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-sm px-3 text-[0.8125rem] font-medium transition-colors sm:min-h-8",
                range === r.v ? "bg-herb text-on-herb" : "text-ink hover:text-herb",
              )}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <dt className="label-mono">Average</dt>
          <dd className="mt-1.5 font-mono text-[1.25rem] leading-none font-medium md:text-[1.625rem]">{avg !== null ? formatWeight(avg, units) : "—"}</dd>
        </div>
        <div>
          <dt className="label-mono">Vs a week ago</dt>
          <dd className="mt-1.5 font-mono text-[1.0625rem] leading-none font-medium md:text-[1.375rem]">
            {change === null ? "—" : change === 0 ? "No change" : `${change < 0 ? "−" : "+"}${diffText(change, units)}`}
          </dd>
          {change === null && <dd className="mt-1 text-[0.6875rem] leading-tight text-ink-muted">Needs weigh-ins from both weeks.</dd>}
        </div>
        <div>
          <dt className="label-mono">To goal</dt>
          <dd className="mt-1.5 font-mono text-[1.0625rem] leading-none font-medium md:text-[1.375rem]">
            {!losingOrGaining ? "Maintaining" : goalKg === null ? "—" : toGo !== null && toGo <= 0 ? "Reached" : toGo !== null ? diffText(toGo, units) : "—"}
          </dd>
          <dd className="mt-1 text-[0.6875rem] leading-tight text-ink-muted">
            {!losingOrGaining ? (
              "Goal weight is for losing or gaining."
            ) : goalKg === null ? (
              <TargetsButton variant="link">Add a goal weight</TargetsButton>
            ) : toGo !== null && toGo > 0 && eta !== null ? (
              `About ${dayMonthYear(addDays(today, eta))} at your pace`
            ) : (
              `Goal ${formatWeight(goalKg, units)}`
            )}
          </dd>
        </div>
      </dl>

      {hasData ? (
        <WeightChart
          mode={range === "weekly" ? "weekly" : "daily"}
          from={from}
          to={today}
          daily={daily}
          weekly={weekly}
          goalKg={goalKg}
          units={units}
          label={label}
          weekSpan={weekSpanWords(weekStart)}
          summary={`${label}. ${summaryBits.filter(Boolean).join(" ")}`}
        />
      ) : (
        <p className="mt-4 rounded-lg bg-band px-4 py-3 text-[0.875rem] text-ink-muted">Log your weight each morning and the 7-day average will be charted here. One reading moves around a lot; the average shows the trend.</p>
      )}

      <WeightLogForm units={units} todayLabel={todays !== null ? formatWeight(todays, units) : null} />
    </section>
  );
}

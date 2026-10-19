/*
 * Weigh-in maths. Pure; no I/O. A scale reading moves around by a kilogram or two from water, salt and timing,
 * so the trend is the 7-day average, not the single reading. For any day, the average is the mean of the
 * weigh-ins logged in the 7 days ending that day (that day and the 6 before). Days without a weigh-in are
 * skipped, not treated as zero. A day with no weigh-ins in its window has no average.
 *
 * Weeks run Monday to Sunday (the weekly view), like the rest of the dashboard.
 */

import { addDays, dayDiff, weekRange, type WeekStart } from "@/lib/me/dates";

export type WeightPoint = { date: string; kg: number };
export type WeightAvgPoint = WeightPoint & { avg: number };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mean of the weigh-ins in the 7 days ending `date`, or null when there are none. `points` need not be sorted. */
export function averageOn(points: WeightPoint[], date: string): number | null {
  const from = addDays(date, -6);
  const inWindow = points.filter((p) => p.date >= from && p.date <= date).map((p) => p.kg);
  return inWindow.length ? r2(mean(inWindow)) : null;
}

/** Every weigh-in with its 7-day average, oldest first. */
export function withRollingAverage(points: WeightPoint[]): WeightAvgPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => ({ ...p, avg: averageOn(sorted, p.date) as number }));
}

/** The 7-day average now minus the 7-day average a week ago. Null until both exist. Negative = lighter. */
export function changeVsWeekAgo(points: WeightPoint[], today: string): number | null {
  const now = averageOn(points, today);
  const before = averageOn(points, addDays(today, -7));
  return now === null || before === null ? null : r2(now - before);
}

export type WeekAvg = { weekStart: string; avg: number; count: number };

/** Average weigh-in per week (Monday to Sunday unless the person starts weeks on Sunday), oldest first. Weeks with no weigh-in are left out. */
export function weeklyAverages(points: WeightPoint[], weekStart: WeekStart = "monday"): WeekAvg[] {
  const byWeek = new Map<string, number[]>();
  for (const p of points) {
    const w = weekRange(p.date, weekStart).from;
    byWeek.set(w, [...(byWeek.get(w) ?? []), p.kg]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, kgs]) => ({ weekStart, avg: r2(mean(kgs)), count: kgs.length }));
}

/** Signed distance from `avgKg` to the goal weight in the direction of travel: positive = still to go. */
export function toGoal(avgKg: number, goalKg: number, goal: "lose" | "gain"): number {
  return r2(goal === "lose" ? avgKg - goalKg : goalKg - avgKg);
}

/** Convenience for the chart: whole days between two dates. */
export const spanDays = dayDiff;

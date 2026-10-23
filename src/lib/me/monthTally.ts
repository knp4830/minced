import { daysInMonth } from "@/lib/me/dates";
import type { FoodStatus } from "@/lib/me/foodStatus";

/*
 * The calendar's one-line summary of the month, e.g. "Trained 12 of 22 days · Goal hit 15 of 22 days".
 * Pure, so the page and the tests count the same way.
 *
 * The denominator is the days of the month that have happened (all of a past month, up to and including
 * today in the current one, none of a future one), because a day that has not come yet is not a miss.
 * "Goal hit" uses the same per-day verdict as the calendar marks (src/lib/me/foodStatus.ts); without
 * targets there is no goal to hit, so the line counts days with food logged instead and says so.
 */

export type TallyDay = { trained: string[]; food: FoodStatus };

export type MonthTally = {
  /** Days of this month that have happened. */
  elapsed: number;
  trainedDays: number;
  hitDays: number;
  partDays: number;
  loggedDays: number;
  line: string;
};

const days = (n: number) => (n === 1 ? "day" : "days");

export function monthTally(
  summaries: Record<string, TallyDay>,
  ym: { year: number; month: number },
  today: string,
  hasGoal: boolean,
): MonthTally {
  const prefix = `${ym.year}-${String(ym.month).padStart(2, "0")}-`;
  const length = daysInMonth(ym.year, ym.month);
  const elapsed = today < `${prefix}01` ? 0 : today.startsWith(prefix) ? Number(today.slice(8, 10)) : length;

  let trainedDays = 0;
  let hitDays = 0;
  let partDays = 0;
  let loggedDays = 0;
  for (let d = 1; d <= elapsed; d++) {
    const day = summaries[`${prefix}${String(d).padStart(2, "0")}`];
    if (!day) continue;
    if (day.trained.length > 0) trainedDays++;
    if (day.food === "hit") hitDays++;
    else if (day.food === "part") partDays++;
    if (day.food !== "none") loggedDays++;
  }

  if (elapsed === 0) return { elapsed, trainedDays, hitDays, partDays, loggedDays, line: "" };

  const bits = [`Trained ${trainedDays} of ${elapsed} ${days(elapsed)}`];
  if (hasGoal) {
    bits.push(`Goal hit ${hitDays} of ${elapsed} ${days(elapsed)}`);
    if (partDays > 0) bits.push(`Partly ${partDays}`);
  } else {
    bits.push(`Food logged ${loggedDays} of ${elapsed} ${days(elapsed)}`);
  }
  return { elapsed, trainedDays, hitDays, partDays, loggedDays, line: bits.join(" · ") };
}

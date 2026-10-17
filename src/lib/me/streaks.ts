/*
 * Streaks: runs of consecutive days with at least one entry of a kind (food, sleep or weight). Pure.
 *
 * A streak is "current" if its last day is today or yesterday. Yesterday still counts because today is not
 * over: logging breakfast tomorrow morning should not look like a broken streak at midnight. After a missed
 * day the current streak is simply 0 and the best one is kept; nothing is shown as a failure.
 */

import { addDays } from "@/lib/me/dates";

export type Streak = { current: number; best: number };

export function computeStreak(dates: string[], today: string): Streak {
  const days = [...new Set(dates.filter((d) => d <= today))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  let last = 0;
  for (const d of days) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    last = run;
    prev = d;
  }
  const alive = prev !== null && (prev === today || prev === addDays(today, -1));
  return { current: alive ? last : 0, best };
}

export const STREAK_KINDS = ["food", "sleep", "weight"] as const;
export type StreakKind = (typeof STREAK_KINDS)[number];

export function computeStreaks(rows: { kind: string; date: string }[], today: string): Record<StreakKind, Streak> {
  const out = {} as Record<StreakKind, Streak>;
  for (const k of STREAK_KINDS) {
    out[k] = computeStreak(
      rows.filter((r) => r.kind === k).map((r) => r.date),
      today,
    );
  }
  return out;
}

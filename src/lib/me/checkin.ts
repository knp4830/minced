/*
 * Check-ins: the one gentle "Update your targets?" card the dashboard may show. Pure.
 *
 * Three reasons, checked in this order, and only the first that applies (and is not snoozed) is shown:
 *   goal    - the goal weight was reached (7-day average on or past it) or the projected date has arrived
 *   weight  - the 7-day average weight is 2 kg or more away from the weight the targets were built on
 *   age     - the targets are 28 or more days old
 * "Not now" snoozes that reason for 14 days. Saving new targets clears every snooze (the app does that),
 * since each of the three is answered by updating them.
 */

import { addDays, dayDiff } from "@/lib/me/dates";
import { daysToGoal, kgToLb1 } from "@/lib/me/targets";
import type { MeTargets } from "@/lib/me/types";

export const WEIGHT_DRIFT_KG = 2;
export const TARGETS_MAX_AGE_DAYS = 28;
export const CHECKIN_SNOOZE_DAYS = 14;

export type CheckInKind = "goal" | "weight" | "age";
export const CHECKIN_KINDS: readonly string[] = ["goal", "weight", "age"];

export type CheckIn = { kind: CheckInKind; title: string; body: string };

/** The date the goal weight is reached at the chosen pace, counted from when the targets were saved. */
export function projectedDateIso(targets: Pick<MeTargets, "weightKg" | "goalWeightKg" | "goal" | "paceKg" | "updatedOn">): string | null {
  const days = daysToGoal(targets.weightKg, targets.goalWeightKg, targets.goal, targets.paceKg);
  return days === null ? null : addDays(targets.updatedOn, days);
}

export function goalReached(targets: Pick<MeTargets, "goalWeightKg" | "goal">, avgKg: number | null): boolean {
  if (targets.goalWeightKg === null || avgKg === null || targets.goal === "maintain") return false;
  return targets.goal === "lose" ? avgKg <= targets.goalWeightKg : avgKg >= targets.goalWeightKg;
}

export function pickCheckIn(input: {
  targets: MeTargets | null;
  avgKg: number | null;
  today: string;
  /** kind -> the local date it was dismissed */
  dismissed: Partial<Record<CheckInKind, string>>;
}): CheckIn | null {
  const { targets, avgKg, today, dismissed } = input;
  if (!targets) return null;
  const snoozed = (k: CheckInKind) => {
    const d = dismissed[k];
    return d !== undefined && dayDiff(today, d) < CHECKIN_SNOOZE_DAYS;
  };

  if (!snoozed("goal") && targets.goal !== "maintain" && targets.goalWeightKg !== null) {
    if (goalReached(targets, avgKg)) {
      return { kind: "goal", title: "Did you hit your goal?", body: "Your 7-day average has reached your goal weight. Nice work. Want to set what comes next?" };
    }
    const date = projectedDateIso(targets);
    if (date !== null && today >= date) {
      return { kind: "goal", title: "Did you hit your goal?", body: "The date we projected for your goal weight has arrived. Did you get there, or is it taking longer?" };
    }
  }

  if (!snoozed("weight") && avgKg !== null && Math.abs(avgKg - targets.weightKg) >= WEIGHT_DRIFT_KG) {
    const d = Math.abs(avgKg - targets.weightKg);
    const diff = targets.units === "imperial" ? `${kgToLb1(d).toFixed(1)} lb` : `${d.toFixed(1)} kg`;
    return {
      kind: "weight",
      title: "Update your targets?",
      body: `Your 7-day average weight is ${avgKg > targets.weightKg ? "up" : "down"} ${diff} from when you set your targets. New targets will fit where you are now.`,
    };
  }

  if (!snoozed("age") && dayDiff(today, targets.updatedOn) >= TARGETS_MAX_AGE_DAYS) {
    return { kind: "age", title: "Update your targets?", body: "It has been a few weeks since you set your targets. A quick look keeps them matched to you." };
  }
  return null;
}

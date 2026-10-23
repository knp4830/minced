import type { Goal } from "@/lib/me/targets";
import type { MeTargets } from "@/lib/me/types";

/*
 * The calendar's nutrition marker, and the words that explain it. THE OWNER APPROVED THESE BANDS (wave 9):
 * a day is a "goal hit" when calories land inside the band for the person's goal AND protein reaches 90% of
 * its target. Food logged but not both is "partly" and the note says which part missed. Without targets there
 * is no goal, so a day is just "logged".
 *
 *   losing      calories 85-105% of target (a deficit day should not run far over)
 *   maintaining calories 90-110%
 *   gaining     calories 95-115% (a surplus day should not fall far short)
 *
 * Percentages are rounded to whole numbers FIRST and the bands are checked against the rounded number, so
 * the percentage shown to the person is always the one the decision used.
 */
export const GOAL_BANDS: Record<Goal, { min: number; max: number; word: string }> = {
  lose: { min: 85, max: 105, word: "losing" },
  maintain: { min: 90, max: 110, word: "maintaining" },
  gain: { min: 95, max: 115, word: "gaining" },
};
export const PROTEIN_FLOOR_PCT = 90;

/** "open" is today with food logged: the day is not over, so it is not judged yet. */
export type FoodStatus = "none" | "logged" | "open" | "hit" | "part";

export type FoodVerdict = {
  status: FoodStatus;
  /** Short, for the calendar's aria label and the day row: what happened or what missed. */
  note: string;
  /** The maths in words, e.g. "1,950 of 2,300 kcal = 85% — inside 85–105% for losing ✓ · Protein ... → partly". Null without a goal. */
  detail: string | null;
  kcalPct: number | null;
  proteinPct: number | null;
};

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const pct = (got: number, target: number) => (target > 0 ? Math.round((got / target) * 100) : 100);

export function dayFoodStatus(
  day: { calories: number; proteinG: number; entries: number },
  targets: Pick<MeTargets, "kcal" | "proteinG" | "goal"> | null,
  /** `open`: the day is still going (today). Breakfast alone is 25% of the day, so it is shown, not marked "partly". */
  opts: { open?: boolean } = {},
): FoodVerdict {
  if (day.entries <= 0) return { status: "none", note: "No meals logged", detail: null, kcalPct: null, proteinPct: null };
  if (!targets) return { status: "logged", note: "Set targets to see how the day went", detail: null, kcalPct: null, proteinPct: null };

  if (opts.open) {
    const k = pct(day.calories, targets.kcal);
    const p = pct(day.proteinG, targets.proteinG);
    return {
      status: "open",
      note: "So far today",
      detail: `So far: ${nf.format(day.calories)} of ${nf.format(targets.kcal)} kcal (${k}%) · protein ${nf.format(day.proteinG)} of ${nf.format(targets.proteinG)} g (${p}%). The day is marked once it is over, so there is still time.`,
      kcalPct: k,
      proteinPct: p,
    };
  }

  const band = GOAL_BANDS[targets.goal];
  const kcalPct = pct(day.calories, targets.kcal);
  const proteinPct = pct(day.proteinG, targets.proteinG);
  const kcalLow = kcalPct < band.min;
  const kcalHigh = kcalPct > band.max;
  const proteinOk = proteinPct >= PROTEIN_FLOOR_PCT;
  const hit = proteinOk && !kcalLow && !kcalHigh;

  const kcalWords = kcalLow ? `under ${band.min}% for ${band.word}` : kcalHigh ? `over ${band.max}% for ${band.word}` : `inside ${band.min}–${band.max}% for ${band.word}`;
  const proteinWords = proteinOk ? `at least ${PROTEIN_FLOOR_PCT}%` : `under ${PROTEIN_FLOOR_PCT}%`;
  const detail =
    `${nf.format(day.calories)} of ${nf.format(targets.kcal)} kcal = ${kcalPct}% — ${kcalWords} ${kcalLow || kcalHigh ? "✗" : "✓"}` +
    ` · Protein ${nf.format(day.proteinG)} of ${nf.format(targets.proteinG)} g = ${proteinPct}% — ${proteinWords} ${proteinOk ? "✓" : "✗"}` +
    ` → ${hit ? "goal hit" : "partly"}`;

  if (hit) return { status: "hit", note: "Goal hit", detail, kcalPct, proteinPct };

  const missed: string[] = [];
  if (!proteinOk) missed.push(`protein ${proteinPct}%, under ${PROTEIN_FLOOR_PCT}%`);
  if (kcalLow) missed.push(`calories ${kcalPct}%, under ${band.min}%`);
  if (kcalHigh) missed.push(`calories ${kcalPct}%, over ${band.max}%`);
  const note = missed.join("; ");
  return { status: "part", note: note.charAt(0).toUpperCase() + note.slice(1), detail, kcalPct, proteinPct };
}

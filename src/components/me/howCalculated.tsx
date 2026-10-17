import Link from "next/link";

import { ChevronDown } from "lucide-react";

import { GOAL_BANDS, PROTEIN_FLOOR_PCT } from "@/lib/me/foodStatus";
import { ACTIVITY, computeTargets, explainTargets } from "@/lib/me/targets";
import type { MeTargets } from "@/lib/me/types";

const nf = new Intl.NumberFormat("en-GB");

/*
 * "How this is calculated": always available under the targets, so nobody has to trust a number they cannot
 * check. It re-runs the formula from the saved body, activity and goal, so what it shows is the working
 * behind the SUGGESTED numbers; if the person edited them when saving, it says so.
 */
export function HowCalculated({ targets }: { targets: MeTargets }) {
  const input = {
    sex: targets.sex,
    age: targets.age,
    heightCm: targets.heightCm,
    weightKg: targets.weightKg,
    activity: targets.activity,
    goal: targets.goal,
    paceKg: targets.paceKg,
  };
  const t = computeTargets(input);
  const { lines } = explainTargets(input, t);
  const edited = t.kcal !== targets.kcal || t.proteinG !== targets.proteinG || t.carbsG !== targets.carbsG || t.fatG !== targets.fatG;
  const band = GOAL_BANDS[targets.goal];

  return (
    <details className="group mt-4 border-t border-line pt-3 text-[0.8125rem]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium text-herb sm:min-h-8 [&::-webkit-details-marker]:hidden">
        How this is calculated
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 text-ink-muted">
        <p>
          Built from what you told us: {targets.sex}, {targets.age} years old, {targets.heightCm} cm, {targets.weightKg} kg, {ACTIVITY[Math.min(Math.max(targets.activity, 0), 4)].label.toLowerCase()}.
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
        {edited && (
          <p className="mt-2">
            You saved {nf.format(targets.kcal)} kcal, {targets.proteinG} g protein, {targets.carbsG} g carbs and {targets.fatG} g fat, which differ a little from the suggestion. Your numbers are the ones used.
          </p>
        )}
        <p className="mt-3">
          A goal day on the calendar: calories between {band.min}% and {band.max}% of {nf.format(targets.kcal)} kcal (for {band.word}) and at least {PROTEIN_FLOOR_PCT}% of your protein target.{" "}
          <Link href="/me/how-goal-days" className="font-medium text-herb underline-offset-2 hover:underline">
            How goal days work
          </Link>
        </p>
        <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-subtle">
          These are estimates for healthy adults, not medical advice. Bodies differ, and the 7,700 kcal-per-kg rule is a rule of thumb. If you have a medical condition or are pregnant, ask a doctor or dietitian.
        </p>
      </div>
    </details>
  );
}

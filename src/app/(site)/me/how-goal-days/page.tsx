import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GOAL_BANDS, PROTEIN_FLOOR_PCT } from "@/lib/me/foodStatus";
import { ME_ENABLED } from "@/lib/me/flag";

export const metadata: Metadata = {
  title: "How goal days work",
  description: "How Minced decides whether a day counts as a goal day, with the numbers shown.",
  robots: { index: false },
};

/*
 * The short explainer the calendar's key links to. The numbers come from the same constants the calendar uses
 * (src/lib/me/foodStatus.ts), so this page cannot drift from what the dashboard actually does.
 */
export default function HowGoalDaysPage() {
  if (!ME_ENABLED) notFound();
  const rows = (["lose", "maintain", "gain"] as const).map((g) => ({ goal: g, ...GOAL_BANDS[g] }));
  return (
    <div className="page-w py-8 md:py-12">
      <Link href="/me" className="inline-flex min-h-11 items-center text-[0.875rem] font-medium text-herb underline-offset-2 hover:underline sm:min-h-0">
        &larr; Back to Me
      </Link>
      <h1 className="mt-3 text-[1.75rem] leading-[1.05] md:text-[2.25rem]">How goal days work</h1>
      <div className="mt-6 max-w-2xl space-y-5 text-[0.9375rem] leading-relaxed">
        <p>
          A day gets the filled plate on your calendar when two things are true: your calories land inside the range for your goal, and you reach at least {PROTEIN_FLOOR_PCT}% of your protein target.
        </p>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-[0.875rem]">
            <caption className="sr-only">Calorie range for a goal day, by goal</caption>
            <thead className="bg-band">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Your goal
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Calories, as a share of your target
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.goal} className="border-t border-line">
                  <th scope="row" className="px-4 py-2.5 font-medium">
                    {r.goal === "lose" ? "Lose weight" : r.goal === "gain" ? "Gain weight" : "Maintain"}
                  </th>
                  <td className="px-4 py-2.5 font-mono">
                    {r.min}% to {r.max}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          The ranges are a little different on purpose. When you are losing, a day that runs far over undoes the deficit, so the top is lower. When you are gaining, a day that falls far short misses the surplus, so the bottom is higher.
        </p>

        <h2 className="text-xl font-medium">What the marks mean</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="font-medium">Filled plate:</strong> goal hit. Calories in range and protein at {PROTEIN_FLOOR_PCT}% or more.
          </li>
          <li>
            <strong className="font-medium">Ring:</strong> partly. You logged food but missed one or both. Open the day and it says which, with the numbers.
          </li>
          <li>
            <strong className="font-medium">Faint ring:</strong> today, still going. Food is added up as you log it, but a day is only marked once it is over, so a light breakfast does not count against you.
          </li>
          <li>
            <strong className="font-medium">No targets yet:</strong> a day with food is just marked as logged, because there is no goal to measure against.
          </li>
        </ul>

        <h2 className="text-xl font-medium">An example</h2>
        <p className="rounded-xl bg-band px-4 py-3 text-[0.875rem]">
          Target 2,300 kcal and 160 g protein, goal lose. You log 1,950 kcal and 131 g. Calories: 1,950 of 2,300 = 85%, inside 85&ndash;105% for losing. Protein: 131 of 160 = 82%, under {PROTEIN_FLOOR_PCT}%. That day is partly: the calories were right, the protein was short.
        </p>

        <p className="text-[0.8125rem] text-ink-muted">
          Percentages are rounded to whole numbers before they are checked, so the number you see is the number that was used. A missed day is just a day; nothing here counts against you.
        </p>
      </div>
    </div>
  );
}

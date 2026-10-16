import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoon } from "@/components/shell/comingSoon";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Me",
  robots: { index: false },
};

/* Placeholder for the personal tracker (BUILD-PLAN "Me"). Nothing is stored here yet. */
export default function MePage() {
  return (
    <div className="page-w py-8 md:py-12">
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">Me</h1>
      <div className="mt-6">
        <ComingSoon
          title="Your meals, your month"
          previews={[
            { name: "Meals", note: "Log what you cooked and ate, in a tap." },
            { name: "Diet", note: "Set the way you eat and see how the day adds up." },
            { name: "Workouts", note: "Note your training so food and effort sit side by side." },
            { name: "Monthly calendar", note: "A look back at the month: what you made, what you hit." },
          ]}
        >
          <p>
            A quiet place to keep track: meals, the way you eat, workouts and a monthly calendar, with your
            nutrients added up for you. It is for quick weeknights, for training days, and for anyone just
            trying to eat a little better. We are still building it, and nothing here saves yet.
          </p>
        </ComingSoon>
        <Link href="/recipes" className={buttonVariants({ variant: "secondary" }) + " mt-8"}>
          Find something to cook
        </Link>
      </div>
    </div>
  );
}

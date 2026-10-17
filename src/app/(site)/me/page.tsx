import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";

import "@/components/me/me.css";

import { CalendarCard, type CalDay } from "@/components/me/calendarCard";
import { LogButton, LogFab } from "@/components/me/meButtons";
import { MeUiProvider } from "@/components/me/meUi";
import { MealsPanel } from "@/components/me/mealsPanel";
import { MorningPrompt } from "@/components/me/morningPrompt";
import { MuscleCard } from "@/components/me/muscleCard";
import { NutrientsPanel } from "@/components/me/nutrientsPanel";
import { TimezoneSync } from "@/components/me/timezoneSync";
import { TodayFood } from "@/components/me/todayFood";
import { ComingSoon } from "@/components/shell/comingSoon";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/queries/account";
import {
  getFoodForDate,
  getMonthSummary,
  getSleepForDate,
  getTargets,
  getWeekMuscles,
  monthRange,
} from "@/lib/queries/me";
import { TZ_COOKIE, longDate, monthGrid, monthLabel, monthParam, parseMonthParam, shiftMonth, todayInZone, weekLabel } from "@/lib/me/dates";
import { dayFoodStatus } from "@/lib/me/foodStatus";
import { ME_ENABLED } from "@/lib/me/flag";
import { sumFood } from "@/lib/me/types";

export const metadata: Metadata = {
  title: "Me",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/*
 * The "Me" dashboard: today's food against your targets, this week's muscles, a month calendar, and quick
 * logging. Personal, so it is rendered per request (it reads the session cookie) and never cached or indexed.
 * Behind NEXT_PUBLIC_ENABLE_ME; off, it is the quiet coming-soon page it used to be.
 */
export default async function MePage({ searchParams }: Props) {
  if (!ME_ENABLED) return <ComingSoonPage />;

  const user = await getCurrentUser();
  if (!user) return <SignedOut />;

  // "Today" is the person's local date. The browser tells us its zone in a cookie; the first visit falls
  // back to the visitor's zone from the host's geo header, then UTC, and TimezoneSync corrects it.
  const jar = await cookies();
  const cookieZone = jar.get(TZ_COOKIE)?.value;
  let zone: string | null = null;
  try {
    zone = cookieZone ? decodeURIComponent(cookieZone) : null; // a malformed cookie must not 500 the page
  } catch {
    zone = null;
  }
  zone ??= (await headers()).get("x-vercel-ip-timezone");
  const today = todayInZone(zone);

  const sp = await searchParams;
  const rawMonth = Array.isArray(sp.m) ? sp.m[0] : sp.m;
  const todayYm = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const ym = parseMonthParam(rawMonth) ?? todayYm;
  const range = monthRange(ym.year, ym.month);

  const [targets, food, sleepToday, week, summaries] = await Promise.all([
    getTargets(),
    getFoodForDate(today),
    getSleepForDate(today),
    getWeekMuscles(today),
    getMonthSummary(range.from, range.to),
  ]);

  const totals = sumFood(food);
  const days: Record<string, CalDay> = {};
  for (const s of summaries) {
    const f = dayFoodStatus({ calories: s.calories, proteinG: s.proteinG, entries: s.foodEntries }, targets);
    days[s.date] = { trained: s.trained, food: f.status, foodNote: f.note, sleep: s.sleepHours };
  }
  const weekMap = Object.fromEntries(week.muscles.map((m) => [m.muscle, { sets: m.sets, days: m.days }]));

  const prev = shiftMonth(ym.year, ym.month, -1);
  const next = shiftMonth(ym.year, ym.month, 1);
  const href = (m: { year: number; month: number }) => (m.year === todayYm.year && m.month === todayYm.month ? "/me" : `/me?m=${monthParam(m.year, m.month)}`);

  return (
    <div className="me-scope page-w py-6 md:py-8">
      <TimezoneSync serverToday={today} />
      <MeUiProvider today={today} targets={targets}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[1.75rem] leading-none font-medium md:text-[2rem]">Me</h1>
          <p className="font-mono text-[0.8125rem] text-ink-muted">{longDate(today)}</p>
          <div className="hidden flex-1 md:block" />
          <LogButton className="hidden self-center md:inline-flex" />
        </div>

        {sleepToday === null && (
          <div className="mt-4">
            <MorningPrompt sleepLogged={false} />
          </div>
        )}

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 md:mt-6 md:gap-6 lg:grid-cols-12">
          <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-6">
            <div className="max-lg:order-3">
              <MuscleCard key={targets?.sex ?? "male"} weekLabel={weekLabel(week.from, week.to)} week={weekMap} defaultSex={targets?.sex ?? "male"} />
            </div>
            <div className="max-lg:order-4">
              <CalendarCard
                monthLabel={monthLabel(ym.year, ym.month)}
                prevHref={href(prev)}
                nextHref={href(next)}
                cells={monthGrid(ym.year, ym.month)}
                days={days}
                today={today}
                targets={targets}
              />
            </div>
          </div>
          <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-6">
            <div className="max-lg:order-1">
              <TodayFood dateLabel={longDate(today).split(" ").slice(0, 3).join(" ")} totals={totals} targets={targets} />
            </div>
            <div className="max-lg:order-5">
              <NutrientsPanel totals={totals} entries={food} />
            </div>
            <div className="max-lg:order-2">
              <MealsPanel food={food} totals={totals} />
            </div>
          </div>
        </div>
        <LogFab />
      </MeUiProvider>
    </div>
  );
}

function ComingSoonPage() {
  return (
    <div className="page-w py-8 md:py-12">
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">Me</h1>
      <div className="mt-6">
        <ComingSoon
          title="Your meals, your month"
          previews={[
            { name: "Meals", note: "Log what you cooked and ate, in a tap." },
            { name: "Targets", note: "Set a calorie and protein goal and see how the day adds up." },
            { name: "Workouts", note: "Note your training so food and effort sit side by side." },
            { name: "Monthly calendar", note: "A look back at the month: what you trained, what you hit." },
          ]}
        >
          <p>
            A quiet place to keep track: meals, workouts, sleep and a monthly calendar, with your nutrients added up for you. It is for quick weeknights, for training days, and for anyone just trying to eat a little
            better. We are still building it, and nothing here saves yet.
          </p>
        </ComingSoon>
        <Link href="/recipes" className={buttonVariants({ variant: "secondary" }) + " mt-8"}>
          Find something to cook
        </Link>
      </div>
    </div>
  );
}

/* Signed out: a calm prompt. The links open the log-in / sign-up dialog over this page (the @modal route). */
function SignedOut() {
  const next = encodeURIComponent("/me");
  return (
    <div className="page-w py-8 md:py-12">
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">Me</h1>
      <section aria-labelledby="me-signin-h" className="mt-6 max-w-xl rounded-xl border border-line bg-surface p-6 md:p-8">
        <p className="label-mono">Just for you</p>
        <h2 id="me-signin-h" className="mt-2 text-2xl leading-tight font-medium">
          Keep track of your food, training and sleep
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          Log in to set a daily calorie and protein target, add what you eat from Minced recipes, note your workouts and see the month at a glance. It is private to you.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/login?next=${next}`} className={buttonVariants({ size: "md" })}>
            Log in
          </Link>
          <Link href={`/signup?next=${next}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
            Create an account
          </Link>
        </div>
      </section>
    </div>
  );
}

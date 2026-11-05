import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";

import "@/components/me/me.css";

import { CalendarCard, type CalDay } from "@/components/me/calendarCard";
import { CheckInCard } from "@/components/me/checkInCard";
import { DayCard } from "@/components/me/dayCard";
import { DayNav } from "@/components/me/dayNav";
import { LogButton, LogFab } from "@/components/me/meButtons";
import { MeUiProvider } from "@/components/me/meUi";
import { MealsPanel } from "@/components/me/mealsPanel";
import { MorningPrompt } from "@/components/me/morningPrompt";
import { MuscleCard } from "@/components/me/muscleCard";
import { NutrientsPanel } from "@/components/me/nutrientsPanel";
import { getNutrients } from "@/lib/queries/recipeNutrients";
import { baselineMacros, type Person } from "@/lib/me/dailyValues";
import { StreakStrip } from "@/components/me/streakStrip";
import { TimezoneSync } from "@/components/me/timezoneSync";
import { TodayFood } from "@/components/me/todayFood";
import { WEIGHT_FETCH_DAYS, WeightCard, type WeightRange } from "@/components/me/weightCard";
import { WorkoutPlansSoon } from "@/components/me/workoutPlansSoon";
import { ComingSoon } from "@/components/shell/comingSoon";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/queries/account";
import {
  getDismissedCheckIns,
  getDayDetail,
  getDris,
  getLoggedDays,
  getMonthSummary,
  getSleepForDate,
  getTargets,
  hasTargetsRow,
  getWeekMuscles,
  getWeights,
  monthRange,
} from "@/lib/queries/me";
import { getMySettings } from "@/lib/queries/settings";
import { pickCheckIn } from "@/lib/me/checkin";
import { TZ_COOKIE, addDays, longDate, monthGrid, monthLabel, monthParam, parseDayParam, parseMonthParam, shiftMonth, todayInZone, weekLabel } from "@/lib/me/dates";
import { dayFoodStatus } from "@/lib/me/foodStatus";
import { ME_ENABLED } from "@/lib/me/flag";
import { monthTally } from "@/lib/me/monthTally";
import { computeStreaks } from "@/lib/me/streaks";
import { averageOn } from "@/lib/me/weight";
import { ageFromBirthYear } from "@/lib/settingsValidate";

export const metadata: Metadata = {
  title: "Me",
  description: "Your own page: what you ate, how you trained and how the week is going, all in one place.",
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
  const rawDay = Array.isArray(sp.d) ? sp.d[0] : sp.d;
  // The day the page shows (?d=): today unless a real, past date was picked in the calendar or the day arrows.
  const selected = parseDayParam(rawDay, today) ?? today;
  const selectedYm = { year: Number(selected.slice(0, 4)), month: Number(selected.slice(5, 7)) };
  const ym = parseMonthParam(rawMonth) ?? selectedYm;
  const range = monthRange(ym.year, ym.month);

  const rawRange = Array.isArray(sp.wr) ? sp.wr[0] : sp.wr;
  const wRange: WeightRange = rawRange === "90" || rawRange === "weekly" ? rawRange : "30";

  // Units, sex and the first day of the week are Settings (one query per request, shared with getTargets).
  const settings = await getMySettings();
  const { weekStart } = settings;

  const [targets, detail, sleepToday, week, summaries, weights, loggedDays, dismissed, nutrientList, dris] = await Promise.all([
    getTargets(zone),
    getDayDetail(selected),
    getSleepForDate(today),
    getWeekMuscles(today, weekStart),
    getMonthSummary(range.from, range.to),
    getWeights(addDays(today, -(WEIGHT_FETCH_DAYS - 1)), today),
    getLoggedDays(today),
    getDismissedCheckIns(),
    getNutrients(),
    getDris(),
  ]);

  // Who the daily values are for. Saved targets win (their own age, their own macros). Without targets, a person
  // who gave a birth year in Settings and has logged a weight gets the sedentary baseline (weight + sex + age);
  // anyone else falls back to the FDA label values (see src/lib/me/dailyValues.ts).
  const avgWeightKg = averageOn(weights, today);
  const baselineWeightKg = avgWeightKg ?? [...weights].sort((x, y) => y.date.localeCompare(x.date))[0]?.kg ?? null;
  const sex = settings.sex ?? targets?.sex ?? null;
  // Settings holds the birth year, so it wins; the age saved with the targets is only the fallback.
  const age = settings.birthYear !== null ? ageFromBirthYear(settings.birthYear) : (targets?.age ?? null);
  const person: Person = {
    sex,
    age,
    macros: targets
      ? { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG, source: "targets" }
      : sex && age !== null && baselineWeightKg !== null
        ? baselineMacros(sex, age, baselineWeightKg)
        : null,
  };

  // Saved targets stay hidden while Settings has no sex (the formula needs one). Say so rather than looking like they were lost.
  const targetsNeedSex = targets === null && settings.sex === null && (await hasTargetsRow());

  const food = detail.food;
  const totals = detail.totals;
  const isToday = selected === today;
  const days: Record<string, CalDay> = {};
  for (const s of summaries) {
    const f = dayFoodStatus({ calories: s.calories, proteinG: s.proteinG, entries: s.foodEntries }, targets, { open: s.date === today });
    days[s.date] = { trained: s.trained, food: f.status, foodNote: f.note, sleep: s.sleepHours, weight: s.weightKg };
  }
  const tally = monthTally(days, ym, today, targets !== null);
  const weekMap = Object.fromEntries(week.muscles.map((m) => [m.muscle, { sets: m.sets, days: m.days }]));

  const weightToday = weights.some((w) => w.date === today);
  const checkin = pickCheckIn({ targets, avgKg: avgWeightKg, today, dismissed });
  const streaks = computeStreaks(loggedDays, today);

  // Month, day and weight-range links keep each other's choice in the URL. A month is written only when it is not
  // the month of the day being shown, and a day only when it is not today, so the plain /me stays plain.
  const link = (o: { month?: { year: number; month: number }; day?: string; wr?: WeightRange }) => {
    const q = new URLSearchParams();
    const day = o.day ?? selected;
    const dayYm = { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
    // Stepping to another day follows that day's month; the month arrows and weight links keep the one shown.
    const month = o.month ?? (o.day ? dayYm : ym);
    if (day !== today) q.set("d", day);
    if (!(month.year === dayYm.year && month.month === dayYm.month)) q.set("m", monthParam(month.year, month.month));
    const wr = o.wr ?? wRange;
    if (wr !== "30") q.set("wr", wr);
    const s = q.toString();
    return s ? `/me?${s}` : "/me";
  };
  const prev = shiftMonth(ym.year, ym.month, -1);
  const next = shiftMonth(ym.year, ym.month, 1);
  const wrHrefs: Record<WeightRange, string> = { "30": link({ wr: "30" }), "90": link({ wr: "90" }), weekly: link({ wr: "weekly" }) };
  const dayHrefs: Record<string, string> = {};
  for (const c of monthGrid(ym.year, ym.month, weekStart)) if (c.iso) dayHrefs[c.iso] = link({ day: c.iso, month: ym });

  return (
    <div className="me-scope page-w py-6 md:py-8">
      <TimezoneSync serverToday={today} />
      <MeUiProvider today={today} viewDate={selected} targets={targets} avgWeightKg={avgWeightKg} settings={{ units: settings.units, sex: settings.sex, birthYear: settings.birthYear }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 id="me-title" tabIndex={-1} className="text-[1.75rem] leading-none font-medium outline-none md:text-[2rem]">
            Me
          </h1>
          <DayNav selected={selected} today={today} prevHref={link({ day: addDays(selected, -1) })} nextHref={link({ day: addDays(selected, 1) })} todayHref={link({ day: today })} />
          <div className="hidden flex-1 md:block" />
          <LogButton className="hidden self-center md:inline-flex" />
        </div>

        <StreakStrip streaks={streaks} />

        {(sleepToday === null || !weightToday) && (
          <div className="mt-4">
            <MorningPrompt sleepLogged={sleepToday !== null} weightLogged={weightToday} units={settings.units} />
          </div>
        )}
        {checkin && (
          <div className="mt-4">
            <CheckInCard key={checkin.kind} checkin={checkin} />
          </div>
        )}

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 md:mt-6 md:gap-6 lg:grid-cols-12">
          <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-6">
            <div className="max-lg:order-4">
              <MuscleCard
                key={`${settings.sex ?? targets?.sex ?? "male"}-${weekStart}`}
                weekLabel={weekLabel(week.from, week.to)}
                week={weekMap}
                defaultSex={settings.sex ?? targets?.sex ?? "male"}
                weekStart={weekStart}
              />
            </div>
            <div className="max-lg:order-5">
              <WorkoutPlansSoon />
            </div>
            <div className="max-lg:order-6">
              <CalendarCard
                monthLabel={monthLabel(ym.year, ym.month)}
                prevHref={link({ month: prev })}
                nextHref={link({ month: next })}
                cells={monthGrid(ym.year, ym.month, weekStart)}
                days={days}
                today={today}
                selected={selected}
                dayHrefs={dayHrefs}
                tally={tally.line}
                weekStart={weekStart}
              />
            </div>
            <div className="max-lg:order-7">
              <DayCard key={selected} detail={detail} targets={targets} today={today} />
            </div>
          </div>
          <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-6">
            <div className="max-lg:order-1">
              <TodayFood dateLabel={longDate(selected).split(" ").slice(0, 3).join(" ")} totals={totals} targets={targets} isToday={isToday} needsSex={targetsNeedSex} />
            </div>
            <div className="max-lg:order-8">
              <NutrientsPanel entries={food} nutrients={nutrientList} dris={dris} person={person} isToday={isToday} />
            </div>
            <div className="max-lg:order-2">
              <MealsPanel food={food} totals={totals} isToday={isToday} />
            </div>
            <div className="max-lg:order-3">
              <WeightCard weights={weights} today={today} range={wRange} hrefs={wrHrefs} targets={targets} units={settings.units} weekStart={weekStart} />
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

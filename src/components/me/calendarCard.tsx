"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Dumbbell, Moon, Plate, ScaleMark } from "@/components/me/dayMarks";
import { addDays, shortDate, weekdayNames, type CalCell, type WeekStart } from "@/lib/me/dates";
import type { FoodStatus } from "@/lib/me/foodStatus";
import { sessionLabel } from "@/lib/me/muscles";
import { cn } from "@/lib/utils";

/*
 * Month calendar, weeks start on Monday (or Sunday, a Setting). Under each date: a dumbbell if you trained, a plate
 * for nutrition (filled = goal hit, ring = partly or just logged, see src/lib/me/foodStatus.ts), a moon with the hours
 * slept and a scale if you weighed in. Every date is a link: it makes that day the one the page shows (`?d=`), so
 * the meals, totals and nutrients above update to it and "+ Add" logs to it. The month is in the URL too (`?m=`),
 * so both are shareable and the back button works. Arrow keys move between dates.
 */

export type CalDay = {
  trained: string[];
  food: FoodStatus;
  foodNote: string;
  sleep: number | null;
  weight: number | null;
};

function dayLabel(iso: string, d: CalDay | undefined, selected: boolean): string {
  const bits: string[] = [];
  if (d?.trained.length) {
    // "Trained" alone is the one-tap marker; once a real session is logged the marker is not repeated.
    const real = d.trained.filter((t) => t !== "trained");
    bits.push(real.length ? `trained ${real.map(prettySession).join(", ")}` : "trained");
  }
  if (d?.food === "hit") bits.push("nutrition goal hit");
  else if (d?.food === "part") bits.push(`nutrition partly: ${d.foodNote.toLowerCase()}`);
  else if (d?.food === "logged") bits.push("food logged");
  else if (d?.food === "open") bits.push("food logged so far today");
  if (d?.sleep != null) bits.push(`slept ${d.sleep} hours`);
  if (d?.weight != null) bits.push("weighed in");
  return `${shortDate(iso)}${bits.length ? `, ${bits.join(", ")}` : ", nothing logged"}${selected ? ", showing" : ""}`;
}

export function prettySession(s: string): string {
  const [kind, name] = s.split(":");
  return kind === "custom" && name ? name : sessionLabel(kind);
}

export function CalendarCard({
  monthLabel,
  prevHref,
  nextHref,
  cells,
  days,
  today,
  selected,
  dayHrefs,
  tally,
  weekStart = "monday",
}: {
  /** The first column's weekday (Settings > Week starts on). `cells` must be built with the same value. */
  weekStart?: WeekStart;
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  cells: CalCell[];
  days: Record<string, CalDay>;
  today: string;
  /** The day the page is showing. */
  selected: string;
  /** Where each date's link goes (keeps the month and the weight range in the URL). */
  dayHrefs: Record<string, string>;
  /** "Trained 12 of 22 days · Goal hit 15 of 22 days"; empty for a month that has not started. */
  tally: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const nothingLogged = Object.keys(days).length === 0;

  const tabbable = cells.find((c) => c.iso === selected)?.iso ?? cells.find((c) => c.iso === today)?.iso ?? cells.find((c) => c.iso && c.iso <= today)?.iso ?? null;

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-iso]");
    const iso = el?.dataset.iso;
    if (!iso) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let target: string | null = null;
    if (step !== undefined) target = addDays(iso, step);
    else if (e.key === "Home") target = cells.find((c) => c.iso)?.iso ?? null;
    else if (e.key === "End") target = [...cells].reverse().find((c) => c.iso && c.iso <= today)?.iso ?? null;
    if (!target) return;
    const next = gridRef.current?.querySelector<HTMLElement>(`a[data-iso="${target}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return (
    <section aria-labelledby="me-cal-h" className="rounded-xl border border-line bg-surface p-3 md:p-[1.375rem]">
      <div className="flex items-center justify-between px-1 md:px-0">
        <h2 id="me-cal-h" className="text-lg leading-tight font-medium" aria-live="polite">
          {monthLabel}
        </h2>
        <div className="flex gap-1">
          <Link href={prevHref} scroll={false} aria-label="Previous month" className="inline-flex size-11 items-center justify-center rounded-md border border-line-strong text-herb transition-colors hover:bg-band sm:size-8">
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
          <Link href={nextHref} scroll={false} aria-label="Next month" className="inline-flex size-11 items-center justify-center rounded-md border border-line-strong text-herb transition-colors hover:bg-band sm:size-8">
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
      {tally && (
        <p data-testid="month-tally" className="mt-1.5 px-1 text-[0.8125rem] leading-snug text-ink-muted md:px-0">
          {tally}
        </p>
      )}

      <div className="label-mono mt-3.5 grid grid-cols-7 text-center" aria-hidden>
        {weekdayNames(weekStart).map((d) => (
          <span key={d}>
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </span>
        ))}
      </div>

      <div ref={gridRef} role="group" aria-label={`${monthLabel}, pick a date`} onKeyDown={onGridKey} className="mt-2 grid grid-cols-7 gap-y-0.5">
        {cells.map((c, i) => {
          if (!c.iso) return <div key={`b${i}`} aria-hidden />;
          const d = days[c.iso];
          const future = c.iso > today;
          const isToday = c.iso === today;
          const isSel = selected === c.iso;
          const cls = cn(
            "flex min-h-[3.125rem] flex-col items-center rounded-md pt-[3px] transition-colors md:min-h-[3.375rem] md:pt-1",
            isSel ? "bg-band ring-1 ring-herb/50 ring-inset" : "hover:bg-band/70",
          );
          const num = (
            <span className={cn("grid size-7 place-items-center rounded-full font-mono text-[0.8125rem]", isToday ? "font-bold ring-2 ring-herb ring-inset" : "font-medium", future && "text-ink/35")}>
              {c.day}
            </span>
          );
          if (future) {
            return (
              <span key={c.iso} className={cn(cls, "cursor-default")} aria-hidden>
                {num}
              </span>
            );
          }
          return (
            <Link
              key={c.iso}
              href={dayHrefs[c.iso] ?? "/me"}
              scroll={false}
              data-iso={c.iso}
              data-selected={isSel || undefined}
              tabIndex={c.iso === tabbable ? 0 : -1}
              aria-label={dayLabel(c.iso, d, isSel)}
              aria-current={isToday ? "date" : undefined}
              className={cls}
            >
              {num}
              <span aria-hidden className="mt-0.5 flex min-h-3 flex-wrap items-center justify-center gap-x-[3px] gap-y-[2px] px-0.5 md:mt-[3px] md:gap-x-[5px]">
                {d?.trained.length ? <Dumbbell /> : null}
                {d && d.food !== "none" ? <Plate hit={d.food === "hit"} dim={d.food === "open"} /> : null}
                {d?.sleep != null ? (
                  <span className="flex items-center gap-[2px] font-mono text-[0.5625rem] text-ink-muted md:text-[0.625rem]">
                    <Moon />
                    <span className="hidden sm:inline">{d.sleep}h</span>
                  </span>
                ) : null}
                {d?.weight != null ? <ScaleMark /> : null}
              </span>
            </Link>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs text-ink-muted" aria-label="Calendar key">
        <li className="flex items-center gap-1.5">
          <Dumbbell /> Trained
        </li>
        <li className="flex items-center gap-1.5">
          <Plate hit /> Nutrition goal hit
        </li>
        <li className="flex items-center gap-1.5">
          <Plate hit={false} /> Partly (protein or calories off)
        </li>
        <li className="flex items-center gap-1.5">
          <Moon /> <span className="font-mono text-[0.6875rem]">7h</span> Sleep
        </li>
        <li className="flex items-center gap-1.5">
          <ScaleMark /> Weighed in
        </li>
        <li className="w-full">
          <Link href="/me/how-goal-days" className="inline-flex min-h-11 items-center font-medium text-herb underline-offset-2 hover:underline sm:min-h-0">
            How goal days work
          </Link>
        </li>
      </ul>
      {nothingLogged && <p className="mt-3 text-[0.8125rem] text-ink-muted">Workouts, nutrition and sleep will appear under each day as you log them.</p>}
    </section>
  );
}

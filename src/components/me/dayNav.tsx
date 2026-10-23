import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { longDate } from "@/lib/me/dates";
import { cn } from "@/lib/utils";

/*
 * Which day the page is showing: step back and forward a day, or jump back to today. The calendar sets the same
 * `?d=` by tapping a date; this is the way to step through days without scrolling back to it. Plain links, so it
 * is a Server Component and the back button works.
 */

const arrow = "inline-flex size-11 items-center justify-center rounded-md border border-line-strong text-herb transition-colors hover:bg-band sm:size-8";

export function DayNav({ selected, today, prevHref, nextHref, todayHref }: { selected: string; today: string; prevHref: string; nextHref: string; todayHref: string }) {
  const isToday = selected === today;
  return (
    <nav aria-label="Day shown" className="flex flex-wrap items-center gap-2">
      <Link href={prevHref} scroll={false} aria-label="Previous day" className={arrow}>
        <ChevronLeft aria-hidden className="size-4" />
      </Link>
      <p data-testid="view-date" className={cn("min-w-[9.5rem] text-center font-mono text-[0.8125rem]", isToday ? "text-ink-muted" : "font-medium text-ink")} aria-live="polite">
        {longDate(selected)}
      </p>
      {isToday ? (
        <span aria-hidden className={cn(arrow, "pointer-events-none opacity-30")}>
          <ChevronRight className="size-4" />
        </span>
      ) : (
        <Link href={nextHref} scroll={false} aria-label="Next day" className={arrow}>
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      )}
      {!isToday && (
        <Link href={todayHref} scroll={false} className="inline-flex min-h-11 items-center rounded-md px-2.5 text-[0.8125rem] font-medium text-herb underline-offset-2 hover:underline sm:min-h-8">
          Back to today
        </Link>
      )}
    </nav>
  );
}

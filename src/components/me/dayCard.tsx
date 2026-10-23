"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";

import { Check, X } from "lucide-react";

import { prettySession } from "@/components/me/calendarCard";
import { Dumbbell, Moon, Plate, ScaleMark } from "@/components/me/dayMarks";
import { useMeUi } from "@/components/me/meUi";
import { clearSleep, clearWeight, deleteWorkout, logTrained, unlogTrained } from "@/lib/actions/me";
import { longDate } from "@/lib/me/dates";
import { dayFoodStatus } from "@/lib/me/foodStatus";
import { formatWeight } from "@/lib/me/targets";
import type { DayDetail, MeTargets } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * The day you picked in the calendar, in one place: did you train (one tap), did you hit your calorie goal
 * (with the maths), sleep, weight, and the buttons to add or change any of it for THAT day. The same day is what
 * the meals, totals and nutrients on the page show, so "Add food" here and "+ Add" there write to the same date.
 * It is a Server Component's data in a client shell only because it has buttons.
 */

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function DayCard({ detail, targets, today }: { detail: DayDetail; targets: MeTargets | null; today: string }) {
  const ui = useMeUi();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const real = detail.workouts.filter((w) => w.session !== "trained");
  const marked = detail.workouts.some((w) => w.session === "trained");
  const serverTrained = detail.workouts.length > 0;
  const [trained, setTrained] = useOptimistic(serverTrained);
  const isToday = detail.date === today;
  const status = dayFoodStatus(detail.totals, targets, { open: isToday });

  function toggleTrained() {
    setError(null);
    startTransition(async () => {
      setTrained(!trained);
      const r = trained ? await unlogTrained(detail.date) : await logTrained(detail.date);
      if (!r.ok) setError(r.error);
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not work. Please try again.");
    });
  }

  return (
    <section aria-labelledby="me-day-h" id="me-day" className="rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]" data-testid="day-card">
      <p className="label-mono">{isToday ? "Today" : "Showing this day"}</p>
      <h2 id="me-day-h" className="mt-1.5 text-lg leading-tight font-medium">
        {longDate(detail.date)}
      </h2>
      {error && (
        <p role="alert" className="mt-2 text-[0.8125rem] text-paprika-deep">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col">
        <Row icon={<Dumbbell dim={!trained} />} label="Training">
          {real.length === 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={trained}
                onClick={toggleTrained}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-sheet border px-3.5 text-[0.8125rem] font-medium transition-colors sm:min-h-9",
                  trained ? "border-herb bg-herb text-on-herb" : "border-line-strong text-ink hover:border-herb hover:text-herb",
                )}
              >
                {trained && <Check aria-hidden className="size-3.5" />}
                {trained ? "Trained" : "I trained"}
              </button>
              <button type="button" onClick={() => ui.openLog(detail.date)} className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-herb underline-offset-2 hover:underline sm:min-h-8">
                {marked ? "Add the details" : "Log a session"}
              </button>
            </div>
          ) : (
            <>
              <ul className="mt-1 space-y-1">
                {real.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 text-[0.8125rem] leading-snug">
                    <span>
                      {prettySession(w.session === "custom" && w.customName ? `custom:${w.customName}` : w.session)}
                      {w.sets > 0 ? ` · ${w.sets} sets` : ""}
                      {w.minutes ? ` · ${w.minutes} min` : ""}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${prettySession(w.session)} workout`}
                      onClick={() => act(() => deleteWorkout(w.id))}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-subtle hover:bg-band hover:text-paprika-deep sm:size-8"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => ui.openLog(detail.date)} className="mt-1 inline-flex min-h-11 items-center rounded-md px-0 text-xs font-medium text-herb underline-offset-2 hover:underline sm:min-h-8">
                Add another session
              </button>
            </>
          )}
        </Row>

        <Row icon={<Plate hit={status.status === "hit"} dim={status.status === "none" || status.status === "open"} />} label="Nutrition" action={{ label: "Add food", aria: `Add food on ${longDate(detail.date)}`, onClick: () => ui.openFood(undefined, detail.date) }}>
          <p className="mt-1 text-[0.8125rem] leading-snug" data-testid="day-kcal">
            {detail.totals.entries === 0
              ? "Nothing logged yet"
              : targets
                ? `${nf.format(detail.totals.calories)} / ${nf.format(targets.kcal)} kcal · protein ${nf.format(detail.totals.proteinG)} / ${nf.format(targets.proteinG)} g`
                : `${nf.format(detail.totals.calories)} kcal · protein ${nf.format(detail.totals.proteinG)} g`}
          </p>
          {status.detail ? (
            <p className="mt-1 text-[0.75rem] leading-snug text-ink-muted" data-testid="day-verdict">
              {status.detail}
            </p>
          ) : (
            <p className="mt-0.5 font-mono text-[0.6875rem] text-ink-muted">{status.note}</p>
          )}
          <p className="mt-1 flex flex-wrap gap-x-4">
            <a href="#me-meals-h" className="inline-flex min-h-11 items-center text-[0.75rem] font-medium text-herb underline-offset-2 hover:underline sm:min-h-0">
              {isToday ? "Today’s meals" : "Meals for this day"}
            </a>
            <Link href="/me/how-goal-days" className="inline-flex min-h-11 items-center text-[0.75rem] font-medium text-herb underline-offset-2 hover:underline sm:min-h-0">
              How goal days work
            </Link>
          </p>
        </Row>

        <Row
          icon={<Moon />}
          label="Sleep"
          action={{ label: detail.sleep != null ? "Edit" : "Add", onClick: () => ui.openLog(detail.date) }}
          onClear={detail.sleep != null ? () => act(() => clearSleep(detail.date)) : undefined}
          clearLabel="Clear sleep"
        >
          <p className="mt-1 font-mono text-[0.8125rem]">{detail.sleep != null ? `${detail.sleep}h slept` : "Not logged"}</p>
        </Row>
        <Row
          icon={<ScaleMark />}
          label="Weight"
          action={{ label: detail.weightKg != null ? "Edit" : "Add", onClick: () => ui.openLog(detail.date) }}
          onClear={detail.weightKg != null ? () => act(() => clearWeight(detail.date)) : undefined}
          clearLabel="Clear weight"
        >
          <p className="mt-1 font-mono text-[0.8125rem]">{detail.weightKg != null ? formatWeight(detail.weightKg, ui.settings.units) : "Not logged"}</p>
        </Row>
      </div>
    </section>
  );
}

function Row({
  icon,
  label,
  action,
  onClear,
  clearLabel,
  children,
}: {
  icon: ReactNode;
  label: string;
  action?: { label: string; aria?: string; onClick: () => void };
  onClear?: () => void;
  clearLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-2.5">
      <span className="mt-1 grid w-3.5 shrink-0 place-items-center" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="label-mono">{label}</p>
        {children}
      </div>
      {onClear && (
        <button type="button" aria-label={clearLabel} onClick={onClear} className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-subtle hover:bg-band hover:text-paprika-deep sm:size-8">
          <X aria-hidden className="size-3.5" />
        </button>
      )}
      {action && (
        <button type="button" onClick={action.onClick} aria-label={action.aria ?? `${action.label} ${label.toLowerCase()}`} className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-line-strong px-2.5 text-xs font-medium text-herb transition-colors hover:bg-band sm:min-h-7">
          {action.label}
        </button>
      )}
    </div>
  );
}

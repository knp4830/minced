"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { useMeUi } from "@/components/me/meUi";
import { clearSleep, clearWeight, deleteWorkout, loadDay } from "@/lib/actions/me";
import { addDays, longDate, shortDate, type CalCell } from "@/lib/me/dates";
import { dayFoodStatus, type FoodStatus } from "@/lib/me/foodStatus";
import { sessionLabel } from "@/lib/me/muscles";
import { formatWeight } from "@/lib/me/targets";
import type { DayDetail, MeTargets } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * Month calendar, weeks start on Monday. Under each date: a dumbbell if you trained, a plate for nutrition (filled = goal hit,
 * ring = partly, see src/lib/me/foodStatus.ts) and the hours slept. Pick a date for the day's detail with
 * edit buttons. The month is in the URL (?m=2026-10) and the arrows are links, so it is shareable and the
 * back button works. Arrow keys move between dates.
 */

export type CalDay = {
  trained: string[];
  food: FoodStatus;
  foodNote: string;
  sleep: number | null;
  weight: number | null;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(iso: string, d: CalDay | undefined): string {
  const bits: string[] = [];
  if (d?.trained.length) bits.push(`trained ${d.trained.map(prettySession).join(", ")}`);
  if (d?.food === "hit") bits.push("nutrition goal hit");
  else if (d?.food === "part") bits.push(`nutrition partly: ${d.foodNote.toLowerCase()}`);
  else if (d?.food === "logged") bits.push("food logged");
  if (d?.sleep != null) bits.push(`slept ${d.sleep} hours`);
  if (d?.weight != null) bits.push("weighed in");
  return `${shortDate(iso)}${bits.length ? `, ${bits.join(", ")}` : ", nothing logged"}`;
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
  targets,
}: {
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  cells: CalCell[];
  days: Record<string, CalDay>;
  today: string;
  targets: MeTargets | null;
}) {
  const ui = useMeUi();
  const gridRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const popId = useId();
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const nothingLogged = Object.keys(days).length === 0;

  const tabbable = cells.find((c) => c.iso === (sel ?? today))?.iso ?? cells.find((c) => c.iso && c.iso <= today)?.iso ?? null;

  function load(iso: string) {
    startTransition(async () => {
      const r = await loadDay(iso);
      if (r.ok) {
        setDetail(r.day);
        setError(null);
      } else setError(r.error);
    });
  }

  function pick(iso: string, el: HTMLElement) {
    if (sel === iso) return close();
    openerRef.current = el;
    setSel(iso);
    setDetail(null);
    setError(null);
    load(iso);
  }

  function close() {
    setSel(null);
    setDetail(null);
    openerRef.current?.focus();
  }

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
    const next = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${target}"]:not(:disabled)`);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return (
    <section aria-labelledby="me-cal-h" className="relative rounded-xl border border-line bg-surface p-3 md:p-[1.375rem]">
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

      <div className="label-mono mt-3.5 grid grid-cols-7 text-center" aria-hidden>
        {WEEKDAYS.map((d) => (
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
          const selected = sel === c.iso;
          return (
            <button
              key={c.iso}
              type="button"
              data-iso={c.iso}
              disabled={future}
              tabIndex={c.iso === tabbable ? 0 : -1}
              aria-label={dayLabel(c.iso, d)}
              aria-expanded={selected}
              aria-controls={selected ? popId : undefined}
              aria-current={isToday ? "date" : undefined}
              onClick={(e) => pick(c.iso as string, e.currentTarget)}
              className={cn(
                "flex h-[3.125rem] flex-col items-center rounded-md pt-[3px] transition-colors disabled:cursor-default md:h-[3.375rem] md:pt-1",
                selected ? "bg-band" : "enabled:hover:bg-band/70",
              )}
            >
              <span className={cn("grid size-7 place-items-center rounded-full font-mono text-[0.8125rem]", isToday ? "font-bold ring-2 ring-herb ring-inset" : "font-medium", future && "text-ink/35")}>
                {c.day}
              </span>
              <span aria-hidden className="mt-0.5 flex h-3 items-center justify-center gap-[3px] md:mt-[3px] md:gap-[5px]">
                {d?.trained.length ? <Dumbbell /> : null}
                {d && d.food !== "none" ? <Plate hit={d.food === "hit"} /> : null}
                {d?.sleep != null ? (
                  <span className="flex items-center gap-[2px] font-mono text-[0.5625rem] text-ink-muted md:text-[0.625rem]">
                    <Moon />
                    {d.sleep}h
                  </span>
                ) : null}
              </span>
            </button>
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
          <Plate hit={false} /> Partly &mdash; protein or calories off
        </li>
        <li className="flex items-center gap-1.5">
          <Moon /> <span className="font-mono text-[0.6875rem]">7h</span> Sleep
        </li>
        <li className="w-full">
          <Link href="/me/how-goal-days" className="inline-flex min-h-11 items-center font-medium text-herb underline-offset-2 hover:underline sm:min-h-0">
            How goal days work
          </Link>
        </li>
      </ul>
      {nothingLogged && <p className="mt-3 text-[0.8125rem] text-ink-muted">Workouts, nutrition and sleep will appear under each day as you log them.</p>}

      {sel && (
        <div
          id={popId}
          role="dialog"
          aria-label={`Details for ${longDate(sel)}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="absolute top-20 left-1/2 z-10 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl border border-line-strong bg-surface p-4 shadow-frame"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="label-mono">Day detail</p>
              <p className="mt-1.5 font-display text-[1.0625rem] leading-tight font-medium">{longDate(sel)}</p>
            </div>
            <button type="button" autoFocus aria-label="Close day detail" onClick={close} className="-mt-1 -mr-1 inline-flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-band sm:size-8">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {error && <p className="mt-3 text-[0.8125rem] text-paprika-deep">{error}</p>}
          {!detail && !error && <p className="mt-3 text-[0.8125rem] text-ink-muted">Loading&hellip;</p>}
          {detail && (
            <DayRows
              detail={detail}
              targets={targets}
              onAddWorkout={() => {
                setSel(null);
                ui.openLog(detail.date);
              }}
              onAddFood={() => {
                setSel(null);
                ui.openFood(undefined, detail.date);
              }}
              onRemoveWorkout={(id) =>
                startTransition(async () => {
                  const r = await deleteWorkout(id);
                  if (r.ok) load(detail.date);
                  else setError(r.error);
                })
              }
              onClear={(what) =>
                startTransition(async () => {
                  const r = what === "sleep" ? await clearSleep(detail.date) : await clearWeight(detail.date);
                  if (r.ok) load(detail.date);
                  else setError(r.error);
                })
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

function DayRows({
  detail,
  targets,
  onAddWorkout,
  onAddFood,
  onRemoveWorkout,
  onClear,
}: {
  detail: DayDetail;
  targets: MeTargets | null;
  onAddWorkout: () => void;
  onAddFood: () => void;
  onRemoveWorkout: (id: string) => void;
  onClear: (what: "sleep" | "weight") => void;
}) {
  const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
  const status = dayFoodStatus(detail.totals, targets);
  const trained = detail.workouts.length > 0;
  return (
    <div className="mt-3 flex flex-col">
      <Row icon={<Dumbbell dim={!trained} />} label="Workout" button={trained ? "Add another" : "Add"} onClick={onAddWorkout}>
        {trained ? (
          <ul className="mt-1 space-y-1">
            {detail.workouts.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 text-[0.8125rem] leading-snug">
                <span>
                  {prettySession(w.session === "custom" && w.customName ? `custom:${w.customName}` : w.session)}
                  {w.sets > 0 ? ` · ${w.sets} sets` : ""}
                  {w.minutes ? ` · ${w.minutes} min` : ""}
                </span>
                <button type="button" aria-label={`Remove ${prettySession(w.session)} workout`} onClick={() => onRemoveWorkout(w.id)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-subtle hover:bg-band hover:text-paprika-deep">
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[0.8125rem]">No workout logged</p>
        )}
      </Row>
      <Row icon={<Plate hit={status.status === "hit"} dim={status.status === "none"} />} label="Nutrition" button="Add" onClick={onAddFood}>
        <p className="mt-1 text-[0.8125rem] leading-snug">
          {detail.totals.entries === 0
            ? "Not logged"
            : targets
              ? `${nf.format(detail.totals.calories)} / ${nf.format(targets.kcal)} kcal · protein ${nf.format(detail.totals.proteinG)} / ${nf.format(targets.proteinG)} g`
              : `${nf.format(detail.totals.calories)} kcal · protein ${nf.format(detail.totals.proteinG)} g`}
        </p>
        {status.detail ? (
          <>
            <p className="mt-1 text-[0.75rem] leading-snug text-ink-muted">{status.detail}</p>
            <Link href="/me/how-goal-days" className="mt-1 inline-flex min-h-11 items-center text-[0.75rem] font-medium text-herb underline-offset-2 hover:underline sm:min-h-0">
              How goal days work
            </Link>
          </>
        ) : (
          <p className="mt-0.5 font-mono text-[0.6875rem] text-ink-muted">{status.note}</p>
        )}
      </Row>
      <Row icon={<Moon />} label="Sleep" button={detail.sleep != null ? "Edit" : "Add"} onClick={onAddWorkout} onClear={detail.sleep != null ? () => onClear("sleep") : undefined} clearLabel="Clear sleep">
        <p className="mt-1 font-mono text-[0.8125rem]">{detail.sleep != null ? `${detail.sleep}h slept` : "Not logged"}</p>
      </Row>
      <Row icon={<ScaleMark />} label="Weight" button={detail.weightKg != null ? "Edit" : "Add"} onClick={onAddWorkout} onClear={detail.weightKg != null ? () => onClear("weight") : undefined} clearLabel="Clear weight">
        <p className="mt-1 font-mono text-[0.8125rem]">{detail.weightKg != null ? formatWeight(detail.weightKg, targets?.units ?? "metric") : "Not logged"}</p>
      </Row>
    </div>
  );
}

function Row({
  icon,
  label,
  button,
  onClick,
  onClear,
  clearLabel,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  button: string;
  onClick: () => void;
  onClear?: () => void;
  clearLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5">
      <span className="grid w-3.5 shrink-0 place-items-center" aria-hidden>
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
      <button type="button" onClick={onClick} aria-label={`${button} ${label.toLowerCase()}`} className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-2.5 text-xs font-medium text-herb transition-colors hover:bg-band sm:min-h-7">
        {button}
      </button>
    </div>
  );
}

/* ---- marks (currentColor, so they follow the token they sit on) ---- */

function Dumbbell({ dim }: { dim?: boolean }) {
  return (
    <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden className={dim ? "text-ink/25" : "text-herb"} fill="currentColor">
      <rect x="0" y="2" width="2" height="4" rx="0.6" />
      <rect x="2.5" y="0.5" width="2.5" height="7" rx="0.6" />
      <rect x="5" y="3" width="4" height="2" />
      <rect x="9" y="0.5" width="2.5" height="7" rx="0.6" />
      <rect x="12" y="2" width="2" height="4" rx="0.6" />
    </svg>
  );
}

function Plate({ hit, dim }: { hit: boolean; dim?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={dim ? "text-ink/25" : "text-herb"}>
      <circle cx="6" cy="6" r="5.2" fill={hit ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="6" r="2.2" fill={hit ? "var(--color-surface)" : "none"} stroke={hit ? "none" : "currentColor"} strokeWidth="1" />
    </svg>
  );
}

function ScaleMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-ink-muted" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="1.2" y="1.2" width="9.6" height="9.6" rx="2" />
      <path d="M3.6 5.2 A2.4 2.4 0 0 1 8.4 5.2" strokeLinecap="round" />
      <path d="M6 5.2 L6.8 3.8" strokeLinecap="round" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className="text-ink-muted" fill="currentColor">
      <path d="M6.5 1.2 A4.6 4.6 0 1 0 10.8 7.4 A3.6 3.6 0 0 1 6.5 1.2 Z" />
    </svg>
  );
}


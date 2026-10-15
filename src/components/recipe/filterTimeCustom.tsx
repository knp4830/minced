"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startNavProgress } from "@/components/shell/navProgress";
import { filtersToQuery, withFilters, type RecipeFilters } from "@/lib/filters";

/*
 * "Your own range" under the total-time buckets: two minute boxes, either of which
 * may be left empty ("from 20" or "up to 45"). It writes `minTime` / `maxTime` to the
 * URL after a pause in typing, on Enter, and when a box loses focus. An empty box
 * removes its param. Recipes with no listed time always pass (see the filter contract).
 */

const DEBOUNCE_MS = 700;

function clean(raw: string): number | undefined {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.trunc(n), 1440);
}

export function TimeCustomRange({ filters, base }: { filters: RecipeFilters; base: string }) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const urlKey = `${filters.minTime ?? ""}|${filters.maxTime ?? ""}`;
  const [from, setFrom] = useState(String(filters.minTime ?? ""));
  const [to, setTo] = useState(String(filters.maxTime ?? ""));
  const [sent, setSent] = useState(urlKey);
  const draftKey = `${clean(from) ?? ""}|${clean(to) ?? ""}`;
  // The URL changed from outside (a bucket chip, clear all, back): the boxes follow it.
  if (urlKey !== sent && urlKey !== draftKey) {
    setSent(urlKey);
    setFrom(String(filters.minTime ?? ""));
    setTo(String(filters.maxTime ?? ""));
  }

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(f: string, t: string) {
    window.clearTimeout(timer.current);
    let lo = clean(f);
    let hi = clean(t);
    // "From 60 to 20" means 20 to 60: swap rather than return nothing.
    if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
    const key = `${lo ?? ""}|${hi ?? ""}`;
    if (key === urlKey) return;
    setSent(key);
    setFrom(lo === undefined ? "" : String(lo));
    setTo(hi === undefined ? "" : String(hi));
    startNavProgress();
    const target = `${base}${filtersToQuery(withFilters(filters, { minTime: lo, maxTime: hi }))}`;
    startTransition(() => router.replace(target, { scroll: false }));
  }

  function schedule(f: string, t: string) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(f, t), DEBOUNCE_MS);
  }

  const box =
    "h-10 w-full min-w-0 rounded-md border border-field bg-surface px-2 font-mono text-xs text-ink pointer-coarse:h-11";

  return (
    <form
      className="mt-2.5 flex items-end gap-2"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        commit(from, to);
      }}
    >
      <label htmlFor={`${uid}-from`} className="min-w-0 flex-1 text-[0.75rem] text-ink-muted">
        From (min)
        <input
          id={`${uid}-from`}
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          placeholder="any"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            schedule(e.target.value, to);
          }}
          onBlur={() => commit(from, to)}
          className={box}
        />
      </label>
      <label htmlFor={`${uid}-to`} className="min-w-0 flex-1 text-[0.75rem] text-ink-muted">
        To (min)
        <input
          id={`${uid}-to`}
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          placeholder="any"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            schedule(from, e.target.value);
          }}
          onBlur={() => commit(from, to)}
          className={box}
        />
      </label>
    </form>
  );
}

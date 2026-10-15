"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startNavProgress } from "@/components/shell/navProgress";
import { filtersToQuery, withFilters, type RecipeFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";

/*
 * Range sliders for the filter panel (calories: two thumbs, protein: one).
 *
 * Built on native <input type="range">: arrow keys, Home/End, PageUp/PageDown and
 * touch drag come from the browser, and screen readers announce them as sliders. Each
 * thumb has its own label and a spoken value ("400 calories"), and a live text readout
 * says what the pair means in plain words.
 *
 * State lives in the URL like every other filter. The thumbs move a local draft so the
 * drag stays smooth; the URL is replaced once the person pauses (DEBOUNCE_MS) and again
 * immediately on release. A thumb at its end stop means "no limit" and removes the param,
 * so a slider that has not been touched never narrows anything.
 */

const DEBOUNCE_MS = 450;

type Props = {
  /** Visible group label. */
  label: string;
  /** Pair of filter keys this slider writes. Single-thumb sliders pass only `minKey`. */
  minKey: "calMin" | "proteinMin";
  maxKey?: "calMax";
  filters: RecipeFilters;
  /** Page the URL change lands on ("/recipes" or "/pantry"). */
  base: string;
  min: number;
  max: number;
  step: number;
  /** Spoken unit for one value: "calories", "grams of protein". */
  unitWord: string;
  /** Short unit for the readout: "cal", "g". */
  unit: string;
};

function readout(lo: number, hi: number, p: Props, single: boolean): string {
  const atMin = lo <= p.min;
  const atMax = hi >= p.max;
  if (single) return atMin ? "Any" : `${lo}${p.unit === "g" ? " g" : " " + p.unit} or more`;
  if (atMin && atMax) return "Any";
  if (atMin) return `Up to ${hi} ${p.unit}`;
  if (atMax) return `${lo}+ ${p.unit}`;
  return `${lo}–${hi} ${p.unit}`;
}

const thumb = [
  "pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent",
  // WebKit
  "[&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none",
  "[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:rounded-full",
  "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface",
  "[&::-webkit-slider-thumb]:bg-herb [&::-webkit-slider-thumb]:shadow-sm",
  "[&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing",
  // Firefox
  "[&::-moz-range-track]:h-full [&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full",
  "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-surface",
  "[&::-moz-range-thumb]:bg-herb [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-grab",
  // Keyboard focus: the shared ring, drawn on the thumb (the input itself is invisible).
  "focus-visible:[&::-webkit-slider-thumb]:outline-2 focus-visible:[&::-webkit-slider-thumb]:outline-offset-2",
  "focus-visible:[&::-webkit-slider-thumb]:outline focus-visible:[&::-webkit-slider-thumb]:outline-ring",
  "focus-visible:[&::-moz-range-thumb]:outline-2 focus-visible:[&::-moz-range-thumb]:outline-offset-2",
  "focus-visible:[&::-moz-range-thumb]:outline focus-visible:[&::-moz-range-thumb]:outline-ring",
].join(" ");

export function FilterSlider(props: Props) {
  const { label, minKey, maxKey, filters, base, min, max, step, unitWord } = props;
  const single = maxKey === undefined;
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();

  const urlLo = Math.min(Math.max(filters[minKey] ?? min, min), max);
  const urlHi = single ? max : Math.min(Math.max(filters[maxKey] ?? max, min), max);
  const urlKey = `${urlLo}|${urlHi}`;

  const [draft, setDraft] = useState<[number, number]>([urlLo, urlHi]);
  // The last value this component sent to the URL. When the URL later shows something
  // else that is not the draft either (clear all, the back button), the draft follows it.
  const [sent, setSent] = useState(urlKey);
  const draftKey = `${draft[0]}|${draft[1]}`;
  if (urlKey !== sent && urlKey !== draftKey) {
    setSent(urlKey);
    setDraft([urlLo, urlHi]);
  }

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(lo: number, hi: number) {
    window.clearTimeout(timer.current);
    setSent(`${lo}|${hi}`);
    const patch: Partial<RecipeFilters> = { [minKey]: lo <= min ? undefined : lo };
    if (maxKey) patch[maxKey] = hi >= max ? undefined : hi;
    const target = `${base}${filtersToQuery(withFilters(filters, patch))}`;
    startNavProgress();
    startTransition(() => router.replace(target, { scroll: false }));
  }

  function move(lo: number, hi: number) {
    setDraft([lo, hi]);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(lo, hi), DEBOUNCE_MS);
  }

  const [lo, hi] = draft;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const readoutText = readout(lo, hi, props, single);
  // When both thumbs sit at the right end the lower one must stay on top, or it could never be dragged back.
  const loOnTop = lo >= max - step;

  return (
    <fieldset className="mb-5 min-w-0" aria-busy={pending}>
      <legend className="label-mono mb-2.5">{label}</legend>
      <p id={`${uid}-out`} className="mb-1 font-mono text-xs text-ink" aria-live="polite">
        {readoutText}
      </p>
      <div className="relative mx-3 h-11">
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-track" />
        <div
          aria-hidden
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-herb"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label={single ? `${label}, at least` : `${label}, minimum`}
          aria-valuetext={lo <= min ? `No minimum` : `${lo} ${unitWord}`}
          aria-describedby={`${uid}-out`}
          onChange={(e) => {
            const v = Number(e.target.value);
            move(single ? v : Math.min(v, hi), hi);
          }}
          onPointerUp={() => commit(lo, hi)}
          className={cn(thumb, loOnTop && !single ? "z-20" : "z-10")}
        />
        {!single && (
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={hi}
            aria-label={`${label}, maximum`}
            aria-valuetext={hi >= max ? `No maximum` : `${hi} ${unitWord}`}
            aria-describedby={`${uid}-out`}
            onChange={(e) => move(lo, Math.max(Number(e.target.value), lo))}
            onPointerUp={() => commit(lo, hi)}
            className={cn(thumb, "z-10")}
          />
        )}
      </div>
      <div aria-hidden className="mx-3 flex justify-between font-mono text-[0.6875rem] text-ink-subtle">
        <span>{min}</span>
        <span>{max}+</span>
      </div>
    </fieldset>
  );
}

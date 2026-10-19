"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/*
 * A radio group drawn as the site's pills. The inputs are real, native radios (arrow keys, one tab stop,
 * announced as "1 of 2") hidden visually behind the pill, which shows the checked state and the focus ring.
 */
export function RadioGroup<T extends string>({
  name,
  legend,
  hint,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  hint?: string;
  value: T | "";
  options: readonly { value: T | ""; label: string }[];
  onChange: (value: T | "") => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <fieldset className="min-w-0" aria-describedby={hint ? hintId : undefined}>
      <legend className="text-[0.9375rem] font-semibold text-ink">{legend}</legend>
      {hint && (
        <p id={hintId} className="mt-1 text-[0.875rem] leading-snug text-ink-muted">
          {hint}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value || "none"} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-sheet border border-line-strong px-4",
                "text-[0.875rem] font-medium whitespace-nowrap text-ink select-none",
                "transition-[background-color,border-color,color] duration-150 ease-out",
                "hover:border-herb hover:text-herb",
                "peer-checked:border-herb peer-checked:bg-herb peer-checked:text-on-herb peer-checked:hover:bg-herb-deep peer-checked:hover:text-on-herb",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-herb",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

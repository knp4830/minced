"use client";

import { useId, useState, useTransition } from "react";

import { useMeUi } from "@/components/me/meUi";
import { logWeight } from "@/lib/actions/me";
import { lbToKg, type Units } from "@/lib/me/targets";

/*
 * Log today's weigh-in from the Weight card. If today already has one, it is shown as the starting text and
 * saving replaces it (one weigh-in per day). Pounds are converted to kilograms here; the database stores kg.
 */
export function WeightLogForm({ units, todayLabel }: { units: Units; todayLabel: string | null }) {
  const ui = useMeUi();
  const id = useId();
  const unit = units === "imperial" ? "lb" : "kg";
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const n = Number(value);
  const kg = units === "imperial" ? lbToKg(n) : n;
  const ok = value.trim() !== "" && Number.isFinite(kg) && kg >= 30 && kg <= 300;

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setMessage(null);
        startTransition(async () => {
          const r = await logWeight(ui.today, kg);
          if (r.ok) setValue("");
          else setMessage(r.error);
        });
      }}
    >
      <div>
        <label htmlFor={id} className="mb-1 block text-[0.8125rem] font-semibold">
          {todayLabel ? "Update today’s weight" : "Log today’s weight"}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
            placeholder={todayLabel ? todayLabel.replace(/ (kg|lb)$/, "") : "0.0"}
            className="h-11 w-28 rounded-field border border-field bg-surface px-3 font-mono text-sm outline-none focus-visible:border-herb sm:h-9"
          />
          <span className="font-mono text-xs text-ink-muted">{unit}</span>
          <button type="submit" disabled={!ok || pending} className="min-h-11 rounded-sheet border border-line-strong px-4 text-[0.8125rem] font-medium text-herb transition-colors hover:bg-band disabled:opacity-50 sm:min-h-9">
            {pending ? "Saving…" : todayLabel ? "Update" : "Log"}
          </button>
        </div>
      </div>
      <p role="alert" className={message ? "w-full text-[0.8125rem] text-paprika-deep" : "sr-only"}>
        {message}
      </p>
    </form>
  );
}

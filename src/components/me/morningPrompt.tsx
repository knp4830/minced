"use client";

import { useEffect, useState, useTransition } from "react";

import { Moon, Scale, X } from "lucide-react";

import { useMeUi } from "@/components/me/meUi";
import { logSleep, logWeight } from "@/lib/actions/me";
import { lbToKg, type Units } from "@/lib/me/targets";
import { cn } from "@/lib/utils";

/*
 * One combined morning card for sleep and weight (never two prompts stacked). Shown only before noon (the
 * browser's clock), only for the parts not logged yet today (the server decides that), and not after it was
 * dismissed today. Sleep is one tap (5-9 hours); weight is one number. Whatever is logged drops out of the
 * card; when nothing is left it goes away.
 */

const KEY = "minced.me.morning-dismissed";
const HOURS = [5, 6, 7, 8, 9];

export function MorningPrompt({ sleepLogged, weightLogged, units }: { sleepLogged: boolean; weightLogged: boolean; units: Units }) {
  const ui = useMeUi();
  const [show, setShow] = useState(false);
  const [sleepDone, setSleepDone] = useState(false);
  const [weightDone, setWeightDone] = useState(false);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needSleep = !sleepLogged && !sleepDone;
  const needWeight = !weightLogged && !weightDone;

  // Reads the browser's clock and storage, which the server cannot know, so this runs after mount.
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(KEY) === ui.today;
    } catch {
      // storage blocked: treat as not dismissed
    }
    if (!dismissed && new Date().getHours() < 12) setShow(true);
  }, [ui.today]);

  if (!show || (!needSleep && !needWeight)) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(KEY, ui.today);
    } catch {
      // not remembered; it will show again next visit
    }
    setShow(false);
  }

  const n = Number(weight);
  const kg = units === "imperial" ? lbToKg(n) : n;
  const weightOk = weight.trim() !== "" && Number.isFinite(kg) && kg >= 30 && kg <= 300;
  const unitWord = units === "imperial" ? "lb" : "kg";

  return (
    <div role="region" aria-label="Morning check-in" className="mx-auto flex w-full max-w-[45rem] flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl border border-line bg-surface py-3 pr-3 pl-4 shadow-lift">
      <div className="mr-auto min-w-40">
        <p className="label-mono">Good morning</p>
        <p className="mt-1 font-display text-base leading-tight font-medium">
          {needSleep && needWeight ? "How did you sleep, and what do you weigh?" : needSleep ? "How did you sleep?" : "Log this morning’s weight"}
        </p>
      </div>

      {needSleep && (
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-band">
            <Moon className="size-4 text-herb" />
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hours slept last night">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await logSleep(ui.today, h);
                    if (r.ok) {
                      setSleepDone(true);
                      setError(null);
                    } else setError(r.error);
                  })
                }
                className={cn("min-h-11 min-w-11 rounded-sheet border border-line-strong px-3 font-mono text-xs font-medium transition-colors hover:border-herb hover:text-herb disabled:opacity-50 sm:min-h-8")}
              >
                {h}h
              </button>
            ))}
            <button type="button" onClick={() => ui.openLog()} className="min-h-11 rounded-sheet border border-line-strong px-3 text-xs font-medium text-herb transition-colors hover:bg-band sm:min-h-8">
              Other
            </button>
          </div>
        </div>
      )}

      {needWeight && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!weightOk) return;
            startTransition(async () => {
              const r = await logWeight(ui.today, kg);
              if (r.ok) {
                setWeightDone(true);
                setError(null);
              } else setError(r.error);
            });
          }}
        >
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-band">
            <Scale className="size-4 text-herb" />
          </span>
          <label className="sr-only" htmlFor="morning-weight">
            Weight in {unitWord}
          </label>
          <input
            id="morning-weight"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
            placeholder={unitWord}
            className="h-11 w-20 rounded-field border border-field bg-surface px-3 text-center font-mono text-sm outline-none focus-visible:border-herb sm:h-8"
          />
          <button type="submit" disabled={!weightOk || pending} className="min-h-11 rounded-sheet border border-line-strong px-3 text-xs font-medium text-herb transition-colors hover:bg-band disabled:opacity-50 sm:min-h-8">
            Log weight
          </button>
        </form>
      )}

      <button type="button" aria-label="Dismiss" onClick={dismiss} className="inline-flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-band sm:size-8">
        <X aria-hidden className="size-4" />
      </button>
      {error && (
        <p role="alert" className="w-full text-[0.8125rem] text-paprika-deep">
          {error}
        </p>
      )}
    </div>
  );
}

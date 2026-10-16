"use client";

import { useEffect, useState, useTransition } from "react";

import { Moon, X } from "lucide-react";

import { useMeUi } from "@/components/me/meUi";
import { logSleep } from "@/lib/actions/me";
import { cn } from "@/lib/utils";

/*
 * "How did you sleep?" Shown only before noon (the browser's clock), only when sleep for today is not
 * logged yet (the server decides that), and not after it was dismissed today. One tap logs 5-9 hours.
 */

const KEY = "minced.me.morning-dismissed";
const HOURS = [5, 6, 7, 8, 9];

export function MorningPrompt({ sleepLogged }: { sleepLogged: boolean }) {
  const ui = useMeUi();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reads the browser's clock and storage, which the server cannot know, so this runs after mount.
  useEffect(() => {
    if (sleepLogged) return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(KEY) === ui.today;
    } catch {
      // storage blocked: treat as not dismissed
    }
    if (!dismissed && new Date().getHours() < 12) setShow(true);
  }, [sleepLogged, ui.today]);

  if (!show || sleepLogged) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(KEY, ui.today);
    } catch {
      // not remembered; it will show again next visit
    }
    setShow(false);
  }

  return (
    <div role="region" aria-label="Morning check-in" className="mx-auto flex w-full max-w-[45rem] flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-xl border border-line bg-surface py-3 pr-3 pl-4 shadow-lift">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-band">
        <Moon className="size-4 text-herb" />
      </span>
      <div className="mr-auto">
        <p className="label-mono">Good morning</p>
        <p className="mt-1 font-display text-base leading-tight font-medium">How did you sleep?</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hours slept last night">
        {HOURS.map((h) => (
          <button
            key={h}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await logSleep(ui.today, h);
                if (r.ok) setShow(false);
                else setError(r.error);
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
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="inline-flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-band sm:size-8">
        <X aria-hidden className="size-4" />
      </button>
      {error && <p role="alert" className="w-full text-[0.8125rem] text-paprika-deep">{error}</p>}
    </div>
  );
}

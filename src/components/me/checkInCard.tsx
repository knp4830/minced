"use client";

import { useState, useTransition } from "react";

import { Sparkles } from "lucide-react";

import { useMeUi } from "@/components/me/meUi";
import { dismissCheckIn } from "@/lib/actions/me";
import type { CheckIn } from "@/lib/me/checkin";

/*
 * One gentle "Update your targets?" card. The server decides which (src/lib/me/checkin.ts) and passes it in;
 * "Not now" is saved in the database, so the answer follows the person between devices and the card stays
 * away for two weeks.
 */
export function CheckInCard({ checkin }: { checkin: CheckIn }) {
  const ui = useMeUi();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (hidden) return null;

  const goal = checkin.kind === "goal";
  return (
    <div role="region" aria-label="Targets check-in" className="mx-auto flex w-full max-w-[45rem] flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl border border-line bg-surface py-3 pr-3 pl-4 shadow-lift">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-band">
        <Sparkles className="size-4 text-herb" />
      </span>
      <div className="mr-auto min-w-48 flex-1">
        <p className="font-display text-base leading-tight font-medium">{checkin.title}</p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">{checkin.body}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => ui.openTargets()} className="min-h-11 rounded-sheet bg-herb px-3.5 text-xs font-medium text-on-herb transition-colors hover:bg-herb-deep sm:min-h-8">
          {goal ? "Yes, set what’s next" : "Update targets"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await dismissCheckIn(checkin.kind, ui.today);
              if (r.ok) {
                // The button is about to unmount; hand focus to the page heading so it does not fall to <body>.
                document.getElementById("me-title")?.focus();
                setHidden(true);
              }
              else setError(r.error);
            })
          }
          className="min-h-11 rounded-sheet border border-line-strong px-3.5 text-xs font-medium transition-colors hover:bg-band disabled:opacity-50 sm:min-h-8"
        >
          {goal ? "Not yet" : "Not now"}
        </button>
      </div>
      {error && (
        <p role="alert" className="w-full text-[0.8125rem] text-paprika-deep">
          {error}
        </p>
      )}
    </div>
  );
}

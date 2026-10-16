"use client";

import { useState } from "react";

import { BodyMap, type MuscleWeek } from "@/components/me/bodyMap/BodyMap";
import { useMeUi } from "@/components/me/meUi";
import type { BodySex } from "@/components/me/bodyMap";
import { cn } from "@/lib/utils";

/*
 * "This week's muscles": the front and back body, tinted by the week's sets per muscle. Desktop shows both
 * bodies side by side; on a phone they are two swipeable pages with dots. The body shown follows the sex
 * chosen in the targets (default male); the toggle underneath changes it for this view only.
 */

const LEGEND = [
  { label: "1 set", cls: "bg-(--me-herb-1)" },
  { label: "2–3 sets", cls: "bg-(--me-herb-2)" },
  { label: "4+ sets", cls: "bg-(--me-herb-3)" },
];

export function MuscleCard({
  weekLabel,
  week,
  defaultSex,
}: {
  weekLabel: string;
  week: Record<string, MuscleWeek>;
  defaultSex: BodySex;
}) {
  const ui = useMeUi();
  const [sex, setSex] = useState<BodySex>(defaultSex);
  const [page, setPage] = useState(0);
  const empty = !Object.values(week).some((w) => w.sets > 0);

  return (
    <section aria-labelledby="me-muscles-h" className="rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="label-mono">{weekLabel}</p>
          <h2 id="me-muscles-h" className="mt-1.5 text-xl leading-tight font-medium">
            This week&rsquo;s muscles
          </h2>
        </div>
        <ul className="flex gap-3 pt-1 text-[0.6875rem] text-ink-muted" aria-label="Colour key">
          {LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2.5 rounded-xs", l.cls)} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="me-swipe -mx-4 mt-4 flex snap-x snap-mandatory overflow-x-auto px-4 md:mx-0 md:justify-center md:gap-11 md:overflow-visible md:px-0"
        onScroll={(e) => {
          const el = e.currentTarget;
          setPage(el.scrollLeft > el.clientWidth / 2 ? 1 : 0);
        }}
      >
        <div className="flex basis-full shrink-0 snap-center justify-center md:basis-auto">
          <BodyMap sex={sex} side="front" week={week} heightClass="h-[280px] md:h-[300px]" />
        </div>
        <div className="flex basis-full shrink-0 snap-center justify-center md:basis-auto">
          <BodyMap sex={sex} side="back" week={week} heightClass="h-[280px] md:h-[300px]" />
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
        {[0, 1].map((i) => (
          <span key={i} className={cn("size-1.5 rounded-full", page === i ? "bg-herb" : "bg-ink/20")} />
        ))}
      </div>
      <p className="mt-2 text-center text-[0.75rem] text-ink-subtle md:hidden">Swipe for the other side</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Body shown" className="inline-flex rounded-md border border-line-strong p-0.5">
          {(["male", "female"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sex === s}
              onClick={() => setSex(s)}
              className={cn(
                "min-h-9 rounded-sm px-3.5 text-[0.8125rem] font-medium transition-colors pointer-coarse:min-h-11",
                sex === s ? "bg-herb text-on-herb" : "text-ink hover:text-herb",
              )}
            >
              {s === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
        {empty && (
          <p className="flex items-center gap-3 text-[0.8125rem] text-ink-muted">
            Log a workout to see what you&rsquo;ve trained this week.
            <button type="button" onClick={() => ui.openLog()} className="font-medium text-herb underline-offset-2 hover:underline">
              Log a workout
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

"use client";

import { useRef, useState, type FocusEvent, type PointerEvent } from "react";

import { CONTEXT_SLUGS, getBodyView, type BodySex, type BodySide } from "@/components/me/bodyMap";
import { intensity, muscleLabel } from "@/lib/me/muscles";

/*
 * One body, one side, as a plain <svg>. Muscles are tinted by this week's sets (intensity 0-3 -> the three
 * herb greens in me.css). Hover, keyboard focus and tap show "Muscle . N sets . days". Only muscles that
 * were trained are keyboard stops, so tabbing through the map visits what you did, not 14 grey shapes; the
 * full list is also written out for screen readers below the picture.
 */

export type MuscleWeek = { sets: number; days: string[] };

type Tip = { text: string; x: number; y: number };

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

function tipText(slug: string, w: MuscleWeek | undefined): string {
  const label = muscleLabel(slug);
  if (!w || w.sets <= 0) return `${label} · not trained this week`;
  const days = w.days.map((d) => DAY.format(Date.parse(`${d}T00:00:00Z`))).join(", ");
  return `${label} · ${w.sets} ${w.sets === 1 ? "set" : "sets"}${days ? ` · ${days}` : ""}`;
}

export function BodyMap({
  sex,
  side,
  week,
  heightClass = "h-[300px]",
}: {
  sex: BodySex;
  side: BodySide;
  week: Record<string, MuscleWeek>;
  /** Tailwind height class; the width follows from the artwork's proportions. */
  heightClass?: string;
}) {
  const view = getBodyView(sex, side);
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hot, setHot] = useState<string | null>(null);

  function place(slug: string, clientX: number, clientY: number) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    setHot(slug);
    setTip({ text: tipText(slug, week[slug]), x: clientX - box.left, y: clientY - box.top });
  }
  function onPointer(slug: string, e: PointerEvent) {
    place(slug, e.clientX, e.clientY);
  }
  function onFocus(slug: string, e: FocusEvent<SVGGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    place(slug, r.left + r.width / 2, r.top);
  }
  function clear() {
    setHot(null);
    setTip(null);
  }

  const inView = new Set(view.parts.map((p) => p.slug));
  const trained = Object.entries(week)
    .filter(([slug, w]) => w.sets > 0 && inView.has(slug))
    .map(([slug, w]) => `${muscleLabel(slug)} ${w.sets} ${w.sets === 1 ? "set" : "sets"}`);
  const sideLabel = side === "front" ? "Front" : "Back";

  return (
    <div ref={wrap} className="relative flex flex-col items-center">
      <svg
        viewBox={view.viewBox}
        role="group"
        aria-label={`${sideLabel} view muscle map, ${sex} body`}
        className={`block w-auto overflow-visible ${heightClass}`}
        onPointerLeave={clear}
      >
        <path d={view.outline} className="me-body-outline" vectorEffect="non-scaling-stroke" />
        {view.parts.map((part) => {
          const isContext = CONTEXT_SLUGS.has(part.slug);
          const w = week[part.slug];
          const sets = w?.sets ?? 0;
          const live = !isContext;
          const trainedHere = sets > 0;
          const shapes = [...(part.left ?? []), ...(part.right ?? []), ...(part.common ?? [])];
          return (
            <g
              key={part.slug}
              className="me-body-g"
              data-live={live}
              data-hot={hot === part.slug}
              {...(live && trainedHere
                ? { role: "img", tabIndex: 0, "aria-label": tipText(part.slug, w), onFocus: (e: FocusEvent<SVGGElement>) => onFocus(part.slug, e), onBlur: clear }
                : {})}
              {...(live
                ? {
                    onPointerEnter: (e: PointerEvent) => onPointer(part.slug, e),
                    onPointerMove: (e: PointerEvent) => onPointer(part.slug, e),
                    onClick: (e: React.MouseEvent) => place(part.slug, e.clientX, e.clientY),
                  }
                : {})}
            >
              {shapes.map((d, i) => (
                <path key={i} d={d} className={isContext ? "me-body-c" : "me-body-m"} data-i={isContext ? undefined : intensity(sets)} />
              ))}
            </g>
          );
        })}
      </svg>
      <span className="label-mono mt-2">{sideLabel}</span>
      {tip && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-sm bg-ink px-2.5 py-2 font-mono text-[0.6875rem] leading-none whitespace-nowrap text-surface"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      )}
      <p className="sr-only">{trained.length ? `Trained this week, ${sideLabel.toLowerCase()} view: ${trained.join(", ")}.` : "Nothing trained this week."}</p>
    </div>
  );
}

"use client";

import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { HeroSlide } from "@/lib/queries/landing";
import { cn } from "@/lib/utils";

const EVERY_MS = 7000;

/**
 * The full-bleed hero photos and the caption that names the dish on screen. Slides crossfade every seven
 * seconds; anything that moves on its own for more than five needs a pause control (WCAG 2.2.2), and
 * reduced-motion visitors get no rotation at all. The server HTML shows slide 0, so the page is complete
 * without JavaScript. `children` (the headline,
 * search card and stats, all server-rendered) sit beside the caption, so the caption and photo share state.
 */
export function HeroPhotos({ slides, children }: { slides: HeroSlide[]; children: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const rotating = slides.length > 1 && !paused && !reduced;
  useEffect(() => {
    if (!rotating) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), EVERY_MS);
    return () => window.clearInterval(t);
  }, [rotating, slides.length]);

  // Every slide is in the viewport, so loading="lazy" would not defer them: instead only the slides already
  // seen are mounted, plus the next one once the page has finished loading (so it never competes with the
  // first photo, the LCP image, and is decoded before its turn).
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [pageLoaded, setPageLoaded] = useState(false);
  useEffect(() => {
    if (document.readyState === "complete") return setPageLoaded(true);
    const on = () => setPageLoaded(true);
    window.addEventListener("load", on);
    return () => window.removeEventListener("load", on);
  }, []);
  useEffect(() => {
    setSeen((s) => (s.has(index) ? s : new Set(s).add(index)));
  }, [index]);
  const next = (index + 1) % slides.length;
  const mounted = (i: number) => seen.has(i) || i === index || (pageLoaded && rotating && i === next);

  const current = slides[index];

  return (
    <>
      <div aria-hidden className="absolute inset-0 bg-night">
        {slides.map((s, i) =>
          mounted(i) ? (
            // Already sized (static 1280/2560 files or the 1200 px Storage copy): no next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={s.slug}
              src={s.url}
              srcSet={s.srcSet}
              sizes="100vw"
              alt=""
              width={1200}
              height={900}
              fetchPriority={i === 0 ? "high" : "low"}
              decoding="async"
              className={cn(
                "absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-out motion-reduce:transition-none",
                i === index ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null,
        )}
        <div className="absolute inset-0 bg-(image:--hero-overlay)" />
        <div className="absolute inset-0 bg-(image:--hero-overlay-side)" />
      </div>

      <div className="relative page-w">
        {children}
        {current && (
          // In the flow (not absolute), so it can never ride over the stats line or the search card.
          // A soft scrim keeps the small credit readable on a bright plate.
          <div className="on-herb mt-5 flex w-fit max-w-full flex-wrap items-center gap-x-1 rounded-lg bg-night/55 py-1 pr-1 pl-3 md:ml-auto">
            <span aria-live={rotating ? "off" : "polite"}>
              <Link
                href={`/recipes/${current.slug}`}
                className="inline-flex min-h-11 items-center font-mono text-[0.8125rem] tracking-[0.02em] text-on-night underline decoration-on-night-muted underline-offset-4 hover:decoration-on-night"
              >
                {current.title}
                {current.totalTimeMin ? ` · ${current.totalTimeMin} min` : ""} · {current.calories} kcal ·{" "}
                {current.proteinG} g protein
              </Link>
            </span>
            {slides.length > 1 && (
              // Hidden by CSS for reduced motion (nothing rotates), so it never flashes before the effect runs.
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Play the photos" : "Pause the photos"}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-on-night hover:text-saffron motion-reduce:hidden"
              >
                {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
              </button>
            )}
            {current.credit && (
              <span className="order-last w-full pb-1 font-mono text-[0.6875rem] text-on-night">
                Photo: {current.credit}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

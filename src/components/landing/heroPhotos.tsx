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
 * without JavaScript. Only slide 0 loads eagerly; the rest load lazily behind it. `children` (the headline,
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

  const current = slides[index];

  return (
    <>
      <div aria-hidden className="absolute inset-0 bg-night">
        {slides.map((s, i) => (
          // Remote Storage host, already resized: no next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.slug}
            src={s.url}
            alt=""
            width={1200}
            height={900}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : undefined}
            decoding="async"
            className={cn(
              "absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-out motion-reduce:transition-none",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
        <div className="absolute inset-0 bg-(image:--hero-overlay)" />
        <div className="absolute inset-0 bg-(image:--hero-overlay-side)" />
      </div>

      <div className="relative page-w">
        {children}
        {current && (
          <div className="on-herb mt-5 flex flex-wrap items-center gap-x-1 md:absolute md:max-w-[44rem] md:justify-end md:right-(--gutter) md:bottom-0 md:mt-0">
            <Link
              href={`/recipes/${current.slug}`}
              aria-live={rotating ? "off" : "polite"}
              className="inline-flex min-h-11 items-center font-mono text-[0.8125rem] tracking-[0.02em] text-on-night underline-offset-4 hover:underline"
            >
              <span>
                {current.title}
                {current.totalTimeMin ? ` · ${current.totalTimeMin} min` : ""} · {current.calories} kcal ·{" "}
                {current.proteinG} g protein
              </span>
            </Link>
            {current.credit && (
              <span className="order-last w-full font-mono text-[0.6875rem] text-on-night-muted md:text-right">
                Photo: {current.credit}
              </span>
            )}
            {slides.length > 1 && !reduced && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Play the photos" : "Pause the photos"}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-on-night-muted hover:text-on-night"
              >
                {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

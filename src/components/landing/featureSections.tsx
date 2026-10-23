import { CalendarCheck, ListChecks, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { ME_ENABLED } from "@/lib/me/flag";

/*
 * One section per feature, each saying plainly what it does and where to find it. Me is a real feature once
 * it is switched on and an honest "coming soon" until then (no link, no sign-up: nothing collects an address).
 */
type Feature = {
  id: string;
  icon: typeof ListChecks;
  eyebrow: string;
  title: string;
  body: string[];
  href?: string;
  cta?: string;
};

function features(): Feature[] {
  return [
    {
      id: "settings",
      icon: SlidersHorizontal,
      eyebrow: "Settings",
      title: "Set your diet and allergens once.",
      body: [
        "Tell Minced how you eat, and your searches and fridge results leave out what doesn’t fit, until you choose to switch your defaults off for a search.",
        "Your cookware lives there too, so Minced can hide anything that needs a pan or pot you don’t own.",
      ],
      href: "/settings",
      cta: "Open settings",
    },
    {
      id: "shopping",
      icon: ListChecks,
      eyebrow: "Shopping list",
      title: "One thing short? Put it on the list.",
      body: [
        "When a recipe needs just one or two more things, a tap adds them to your shopping list, so you know exactly what to pick up on the way home.",
      ],
      href: "/shopping",
      cta: "Open my shopping list",
    },
    ME_ENABLED
      ? {
          id: "me",
          icon: CalendarCheck,
          eyebrow: "Me",
          title: "Keep track of your days.",
          body: [
            "Log what you cook, set calorie and protein targets, and note your workouts and sleep. Sign in to start.",
          ],
          href: "/me",
          cta: "Open Me",
        }
      : {
          id: "me",
          icon: CalendarCheck,
          eyebrow: "Me · coming soon",
          title: "A page that’s just yours.",
          body: [
            "We’re building a place to log what you ate each day and watch the nutrition add up, with a calendar for the days you trained and the days you hit your goal. It isn’t switched on yet, and we’d rather say so than pretend.",
          ],
        },
  ];
}

export function FeatureSections() {
  return (
    <>
      {features().map((f, i) => (
        <section
          key={f.id}
          id={f.id}
          aria-labelledby={`${f.id}-h`}
          className={i % 2 === 0 ? "border-b border-line bg-canvas" : "border-b border-line bg-surface"}
        >
          <div className="mx-auto grid max-w-[var(--page-max)] items-center gap-6 px-(--gutter) py-10 md:grid-cols-[auto_1fr] md:gap-12 md:py-14">
            <span
              aria-hidden
              className="flex size-14 items-center justify-center rounded-2xl bg-band text-herb md:size-24 md:rounded-3xl"
            >
              <f.icon className="size-6 md:size-10" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 max-w-[40rem]">
              <p className="label-mono mb-2 text-herb">{f.eyebrow}</p>
              <h2 id={`${f.id}-h`} className="text-[1.5rem] leading-[1.1] tracking-[-0.02em] md:text-[2rem]">
                {f.title}
              </h2>
              {f.body.map((p) => (
                <p key={p} className="mt-3 text-base leading-relaxed text-ink-muted">
                  {p}
                </p>
              ))}
              {f.href && f.cta && (
                <Link href={f.href} className={`${buttonVariants({ variant: "secondary", size: "md" })} mt-5`}>
                  {f.cta}
                </Link>
              )}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

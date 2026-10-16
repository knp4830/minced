import { Dumbbell, LineChart, Users } from "lucide-react";

/*
 * Honest roadmap cards. None of these are built, so they are not links, have no
 * sign-up or "notify me" control (nothing collects an address), and say
 * "Coming soon" in words, not just a badge colour.
 */
const ITEMS = [
  {
    icon: Dumbbell,
    title: "Plan your workouts",
    body: "Line your meals up with your training days: higher-protein dinners after leg day, something light on rest days.",
  },
  {
    icon: LineChart,
    title: "Track your nutrition",
    body: "See calories, protein and the rest add up across what you cook, against the targets you set.",
  },
  {
    icon: Users,
    title: "Share your own recipes",
    body: "Add the recipes you actually cook. Every submission is reviewed before it is published, so the catalog stays accurate and fair to the people who wrote it.",
  },
] as const;

export function ComingSoon() {
  return (
    <section aria-labelledby="soon-h" className="px-(--gutter) py-14 md:py-20">
      <div className="mx-auto max-w-[var(--page-max)]">
        <div className="mb-8 flex flex-col gap-2 md:mb-10 md:max-w-[40rem]">
          <h2 id="soon-h" className="label-mono">
            On the way
          </h2>
          <p className="font-display text-[1.625rem] leading-[1.15] text-ink-deep md:text-[2rem]">
            Finding the recipe is the start. We’re building the rest of the week around it.
          </p>
          <p className="text-base leading-[1.55] text-ink-muted">
            None of this is live yet. It’s what we’re working on next, so you can see where
            Minced is headed.
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-3 md:gap-[22px]">
          {ITEMS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="relative flex flex-col overflow-hidden rounded-xl border border-dashed border-outline bg-surface/60 p-6 pt-7"
            >
              <span className="absolute top-4 right-4 rounded-full border border-saffron-ink/30 bg-saffron-tint px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.08em] text-saffron-ink uppercase">
                Coming soon
              </span>
              <span
                aria-hidden
                className="mb-5 flex size-11 items-center justify-center rounded-xl bg-band text-herb"
              >
                <Icon className="size-5" />
              </span>
              <h3 className="mb-2 text-xl tracking-[-0.01em]">{title}</h3>
              <p className="text-sm leading-normal text-ink-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/*
 * The dark band at the bottom of the landing (wave 13, layout 3c): three honest roadmap cards. None of these
 * are built, so they are not links, have no sign-up or "notify me" control (nothing collects an address),
 * and say "Coming soon" in words. The site footer follows on the same dark ground (SiteFooter tone="night").
 */
const ITEMS = [
  {
    title: "Workout plans",
    body: "Line your meals up with your training days: more protein when you train, something lighter on rest days.",
  },
  {
    title: "Share your recipes",
    body: "Add the recipes you actually cook. Every one is reviewed before it’s published, so the catalog stays accurate.",
  },
  {
    title: "More cuisines",
    body: "More of the world’s kitchens, each recipe with the same honest numbers and clear steps.",
  },
] as const;

export function ComingSoon() {
  return (
    <section aria-labelledby="soon-h" className="bg-night text-on-night">
      <div className="page-w pt-14 pb-4 md:pt-20">
        <h2 id="soon-h" className="mb-8 font-mono text-[0.6875rem] tracking-[0.12em] text-on-night-muted uppercase">
          Coming soon
        </h2>
        <ul className="grid gap-8 md:grid-cols-3 md:gap-10">
          {ITEMS.map(({ title, body }) => (
            <li key={title} className="border-t border-night-line pt-5">
              <h3 className="mb-2 text-[1.375rem] leading-tight text-on-night">{title}</h3>
              <p className="text-[0.9375rem] leading-normal text-on-night-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

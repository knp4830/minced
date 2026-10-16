import type { ReactNode } from "react";

/** A calm "this is on the way" block for features that are planned but not built. */
export function ComingSoon({
  title,
  children,
  previews = [],
}: {
  title: string;
  children: ReactNode;
  /** Short names of what is planned; drawn as dashed, inert cards. */
  previews?: { name: string; note: string }[];
}) {
  return (
    <div>
      <p className="label-mono mb-3">Coming soon</p>
      <h2 className="text-xl md:text-2xl">{title}</h2>
      <div className="mt-2 max-w-[38em] text-[0.9375rem] leading-relaxed text-ink-muted">{children}</div>
      {previews.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {previews.map((p) => (
            <li key={p.name} className="rounded-xl border border-dashed border-line-strong px-4 py-3.5">
              <p className="font-display text-lg leading-tight">{p.name}</p>
              <p className="mt-1 text-[0.875rem] leading-snug text-ink-muted">{p.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

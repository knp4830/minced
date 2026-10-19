import type { ReactNode } from "react";

/**
 * One block of the Settings page: a real `<h2>` (screen-reader navigation), an optional mono eyebrow, and the
 * content. Sections are separated by hairlines and stand alone: each saves by itself, so a failure in one never
 * blocks another. `id` is the deep-link target (`/settings#food`, `/settings#cookware`).
 */
export function SettingsSection({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${id}-h`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-24 border-t border-line py-7 first:border-t-0 first:pt-0">
      {eyebrow && <p className="label-mono mb-1.5">{eyebrow}</p>}
      <h2 id={headingId} className="text-[1.375rem] leading-tight">
        {title}
      </h2>
      {lead && <p className="mt-1.5 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

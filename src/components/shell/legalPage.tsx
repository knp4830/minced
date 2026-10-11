import type { ReactNode } from "react";

/** Shared frame for /privacy and /terms: a title, a date, plain numbered sections. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[44rem] px-(--gutter) py-8 md:py-14">
      <h1 className="text-[2rem] leading-[1.05] md:text-[2.75rem]">{title}</h1>
      <p className="mt-2 font-mono text-xs text-ink-subtle">Last updated {updated}</p>
      <p className="mt-4 text-base leading-relaxed text-ink-soft md:text-[1.0625rem]">{intro}</p>
      {children}
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-9 md:mt-11">
      <h2 id={id} className="text-xl md:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-ink-soft md:text-base [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export const legalLink = "font-medium text-ink underline underline-offset-4 hover:text-herb";
export const CONTACT_URL = "https://github.com/knp4830/minced/issues/new";

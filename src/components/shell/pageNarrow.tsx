import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * THE narrow-page frame. Rule: narrow reading pages (settings, account, about,
 * privacy, terms) centre their column inside the page container; wide pages
 * (fridge, shopping, me) use the full page-w width and do not use this.
 *
 * `page-w` stays the outer box so the edges still line up with the header and
 * footer; a column of the chosen measure is centred inside it.
 *   form    36rem: a single-column form (settings)
 *   article 73rem: the title rail + 46rem text layout (about, privacy, terms)
 *   wide    64rem: tabs and a card grid (account)
 */
const WIDTHS = {
  form: "max-w-xl",
  article: "max-w-[73rem]",
  wide: "max-w-5xl",
} as const;

/** The centred-column classes alone, for skeleton frames that already own the outer box. */
export function narrowColumn(width: keyof typeof WIDTHS = "form") {
  return cn("mx-auto w-full", WIDTHS[width]);
}

export function PageNarrow({
  width = "form",
  className,
  innerClassName,
  children,
}: {
  width?: keyof typeof WIDTHS;
  /** Outer box: vertical padding. */
  className?: string;
  /** The centred column: put a grid here (the article layout does). */
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("page-w", className)}>
      <div className={cn(narrowColumn(width), innerClassName)}>{children}</div>
    </div>
  );
}

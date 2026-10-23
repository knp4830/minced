import type { Metadata } from "next";

/**
 * One place that turns a page's title, description and path into the full set of tags: canonical,
 * Open Graph and Twitter. A page's own `openGraph` replaces the layout's (Next merges per top-level
 * key, not deeply), so each page has to restate siteName, title and description; this does it once.
 *
 * Pass `image` only for a real photo; without it the branded card at /og
 * (src/app/og/route.tsx) is used.
 */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  /** Use the title as-is, without the " · Minced" suffix (the landing page). */
  absoluteTitle?: boolean;
  image?: string | null;
  type?: "website" | "article";
}): Metadata {
  const images = opts.image ? [opts.image] : ["/og"];
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      siteName: "Minced",
      locale: "en_US",
      type: opts.type ?? "website",
      url: opts.path,
      title: opts.title,
      description: opts.description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images,
    },
  };
}

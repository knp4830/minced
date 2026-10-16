/**
 * The public origin, for canonical links, the sitemap, robots.txt, JSON-LD and the links inside
 * auth emails. NEXT_PUBLIC_SITE_URL overrides it (previews, local). The fallback is the
 * production domain, so a missing variable can never put the old *.vercel.app host back into
 * search results.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://minced.kevinpham.page").replace(/\/$/, "");

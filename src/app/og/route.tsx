import { renderOgCard } from "@/lib/seo/ogCard";

/**
 * The default share card, at /og. A route handler rather than the opengraph-image file convention on
 * purpose: Next gives that file priority over a page's own `openGraph.images`, which would replace
 * every recipe's real photo with this card. Static (no cookies, no query), so it is drawn once at
 * build and served from the CDN.
 */
export const dynamic = "force-static";

export async function GET() {
  const res = await renderOgCard();
  res.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  return res;
}

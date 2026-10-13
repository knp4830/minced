/*
 * "Does this recipe exist?", answered in the middleware so an unknown recipe URL
 * gets a real HTTP 404.
 *
 * Why not just notFound() in the page: /recipes/[slug] is ISR (see its page.tsx),
 * and Next answers a not-found caught during static rendering with 200 plus a
 * noindex tag, then caches that 200 for an hour. Search engines and uptime
 * monitors read 200 as "this page exists". Next only sets a 404 status for
 * dynamic renders, and calling a dynamic API to force one inside an ISR page is a
 * 500. A middleware response is the one place the status is ours to set, without
 * giving up the CDN-cached pages for recipes that do exist.
 *
 * Edge-safe: fetch only, no Node APIs, no cookies. The answer for a KNOWN slug is
 * remembered per instance for an hour, so a popular recipe costs one lookup per
 * instance per hour, not one per view. Unknown slugs are never remembered (a new
 * recipe must appear at once). On any trouble talking to the database it fails
 * OPEN: the page renders and its own notFound() applies, which is a soft 404 and
 * never a wrongly rejected real recipe.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,150}$/;
const KNOWN_TTL_MS = 60 * 60 * 1000;
const KNOWN_MAX = 2000;
const LOOKUP_TIMEOUT_MS = 1500;

const known = new Map<string, number>();

export async function recipeExists(slug: string): Promise<boolean> {
  if (!SLUG.test(slug)) return false;

  const until = known.get(slug);
  if (until !== undefined && until > Date.now()) return true;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return true;

  try {
    const res = await fetch(
      `${base}/rest/v1/recipes?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        cache: "no-store",
      },
    );
    if (!res.ok) return true;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return true;
    if (rows.length === 0) return false;

    if (known.size >= KNOWN_MAX) known.clear();
    known.set(slug, Date.now() + KNOWN_TTL_MS);
    return true;
  } catch {
    return true;
  }
}

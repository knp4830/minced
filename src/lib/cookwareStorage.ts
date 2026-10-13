/**
 * Browser-side memory for "My cookware", the twin of fridgeStorage.ts.
 * Client-only: every function touches `window.localStorage` and swallows the
 * errors a private window or blocked storage throws. The URL
 * (`ownedCookware` + `ownedOnly`) is the truth; storage only lets a returning
 * visitor skip re-picking. A signed-in cook's list also lives in their account
 * (see src/lib/queries/userCookware.ts).
 *
 * Precedence on arrival: URL > account > this storage.
 */

export type StoredCookware = { slugs: string[]; only: boolean };

const KEY = "minced.cookware.v1";
const MAX_ITEMS = 50;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function readCookware(): StoredCookware {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { slugs: [], only: false };
    const p = JSON.parse(raw) as { slugs?: unknown; only?: unknown } | null;
    const slugs = Array.isArray(p?.slugs)
      ? [...new Set((p.slugs as unknown[]).filter((s): s is string => typeof s === "string" && SLUG.test(s)))].slice(
          0,
          MAX_ITEMS,
        )
      : [];
    // "Only my cookware" with nothing owned would hide every recipe that needs a pan;
    // never restore that by accident.
    return { slugs, only: p?.only === true && slugs.length > 0 };
  } catch {
    return { slugs: [], only: false };
  }
}

export function writeCookware(value: StoredCookware) {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ slugs: value.slugs.slice(0, MAX_ITEMS), only: value.only }),
    );
  } catch {
    /* private window / blocked storage: the URL still carries the list */
  }
}

/**
 * The current page's URL with the cookware state replaced. Read at call time
 * (not useSearchParams) so statically cached pages need no Suspense. Paging is
 * dropped: any filter change invalidates the cursor.
 */
export function cookwareUrl(value: StoredCookware): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("cursor");
  if (value.slugs.length) params.set("ownedCookware", value.slugs.join(","));
  else params.delete("ownedCookware");
  if (value.only) params.set("ownedOnly", "1");
  else params.delete("ownedOnly");
  const qs = params.toString().replaceAll("%2C", ",");
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

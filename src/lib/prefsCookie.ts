import { cookies } from "next/headers";

import {
  decodePrefs,
  encodePrefs,
  hasSupabaseAuthCookie,
  isEmptyDefaults,
  PREFS_COOKIE,
  PREFS_MAX_AGE_S,
  restrictToVocab,
} from "@/lib/prefs";
import { withDefaults, type DefaultsState, type RecipeFilters } from "@/lib/filters";
import { getDefaultsWith } from "@/lib/queries/settings";
import type { FoodDefaults } from "@/lib/settingsValidate";

/*
 * The prefs cookie's jar: read it on the list pages, write it wherever the signed-in state is known, clear it
 * wherever the session ends. See prefs.ts for why it exists and how far it is trusted.
 *
 * WRITTEN by: log-in and sign-up (when a session starts), the email / OAuth callback, saveFoodDefaults, and
 *   GET /api/me (which heals drift between devices and rolls the 7-day expiry).
 * CLEARED by: log-out, delete account, GET /api/me answering "nobody is signed in".
 */

/** The signed-in visitor's default filters, or null (signed out, no cookie, forged or empty). */
export async function readPrefs(): Promise<FoodDefaults | null> {
  const jar = await cookies();
  const raw = jar.get(PREFS_COOKIE)?.value;
  if (!raw) return null;
  // A leftover cookie must not filter a signed-out visitor's results.
  if (!hasSupabaseAuthCookie(jar.getAll().map((c) => c.name))) return null;
  const d = decodePrefs(raw);
  return isEmptyDefaults(d) ? null : d;
}

/**
 * Writes the cookie from the database's values. Empty defaults clear it instead (nothing to remember).
 * httpOnly: nothing in the browser reads it, the server renders the "Your defaults" chip.
 * Callable from Server Actions and Route Handlers only (a Server Component cannot set cookies).
 */
export async function setPrefsCookie(userId: string, defaults: FoodDefaults): Promise<void> {
  const jar = await cookies();
  if (isEmptyDefaults(defaults)) {
    jar.delete(PREFS_COOKIE);
    return;
  }
  jar.set(PREFS_COOKIE, encodePrefs(defaults, userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PREFS_MAX_AGE_S,
  });
}

export async function clearPrefsCookie(): Promise<void> {
  (await cookies()).delete(PREFS_COOKIE);
}

/**
 * Re-reads the database's defaults with a client that holds the session and writes the cookie from them. Used
 * the moment a session starts (log-in, sign-up with a session, the email / OAuth callback). Never throws: a
 * failure here only means the cookie is set a moment later by /api/me.
 */
export async function syncPrefsCookie(db: unknown): Promise<void> {
  try {
    const r = await getDefaultsWith(db);
    if (r) await setPrefsCookie(r.userId, r.defaults);
  } catch {
    /* healed by /api/me on the next page */
  }
}

/**
 * The one call a list page makes: read the cookie (outside every cache), drop slugs that are not in the real
 * vocabulary, and merge with the URL's filters. Both doors use it, so a default can never apply to one and not
 * the other.
 */
export async function resolveDefaults(
  url: RecipeFilters,
  options: { diets: { slug: string }[]; allergens: { slug: string }[] },
): Promise<DefaultsState> {
  const saved = restrictToVocab(await readPrefs(), {
    diets: options.diets.map((d) => d.slug),
    allergens: options.allergens.map((a) => a.slug),
  });
  return withDefaults(url, saved);
}

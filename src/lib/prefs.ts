/*
 * The "prefs" cookie: a server-readable copy of the signed-in person's default diet and allergen filters.
 *
 * Why a cookie and not a database read: /recipes and /pantry must apply the defaults on the SERVER, before the
 * first byte of HTML (an allergen filter that flashes unfiltered results and then swaps is not acceptable),
 * and an extra auth + database round trip on every list view is not acceptable either. The database
 * (`user_settings`) stays the truth; the cookie is a cache of it that /api/me refreshes.
 *
 * Trust: the cookie is user-controlled input, exactly like the URL. It is parsed with the same slug rules,
 * capped, and (by the caller) checked against the real diet / allergen vocabulary. The worst a forged cookie
 * can do is filter the forger's own results. It is also honoured only while a Supabase auth cookie exists, so
 * a leftover cookie can never filter a signed-out visitor.
 *
 * Pure module (no next/headers) so the unit tests can load it; the cookie jar lives in prefsCookie.ts.
 */

import { expandLegacyAllergens, expandPreSplitAllergens } from "@/lib/allergenSlugs";
import { MAX_ALLERGENS, MAX_DIETS, SLUG, type FoodDefaults } from "@/lib/settingsValidate";

export const PREFS_COOKIE = "minced_prefs";
export const PREFS_MAX_AGE_S = 7 * 24 * 60 * 60;
/** 2 since the wave 10c allergen split. A version 1 cookie is still read (see decodePrefs) so no one loses protection. */
const VERSION = 2;
/** An encoded prefs cookie is a few hundred bytes at most; anything bigger is not ours. */
const MAX_ENCODED = 1500;

export const EMPTY_DEFAULTS: FoodDefaults = { diet: [], exclude: [] };

export function isEmptyDefaults(d: FoodDefaults | null | undefined): boolean {
  return !d || (d.diet.length === 0 && d.exclude.length === 0);
}

function b64urlEncode(s: string): string {
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replaceAll("-", "+").replaceAll("_", "/") + pad);
}

/** `{"v":2,"d":[diet...],"x":[allergen...],"u":"<first 8 hex of the user id>"}` as base64url. */
export function encodePrefs(d: FoodDefaults, userId: string): string {
  const u = userId.replace(/[^0-9a-f]/gi, "").slice(0, 8).toLowerCase();
  return b64urlEncode(JSON.stringify({ v: VERSION, d: d.diet, x: d.exclude, u }));
}

function cleanSlugs(raw: unknown, max: number): string[] | null {
  if (!Array.isArray(raw) || raw.length > max * 4) return null;
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string" || !SLUG.test(s)) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out.length > max ? null : out.sort();
}

/** Total: any malformed, wrong-version or oversize value is `null`, never a throw. */
export function decodePrefs(raw: string | undefined | null): FoodDefaults | null {
  if (!raw || raw.length > MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const o = JSON.parse(b64urlDecode(raw)) as Record<string, unknown>;
    if (!o || typeof o !== "object" || (o.v !== VERSION && o.v !== 1)) return null;
    if (typeof o.u !== "string" || !/^[0-9a-f]{0,8}$/.test(o.u)) return null;
    const diet = cleanSlugs(o.d, MAX_DIETS);
    const exclude = cleanSlugs(o.x, MAX_ALLERGENS);
    if (!diet || !exclude) return null;
    return { diet, exclude: o.v === 1 ? expandPreSplitAllergens(exclude).sort() : exclude };
  } catch {
    return null;
  }
}

/** Keep only slugs that really exist (the cached filter vocabulary). */
export function restrictToVocab(
  d: FoodDefaults | null,
  vocab: { diets: readonly string[]; allergens: readonly string[] },
): FoodDefaults | null {
  if (!d) return null;
  const out = {
    diet: d.diet.filter((s) => vocab.diets.includes(s)),
    exclude: expandLegacyAllergens(d.exclude).sort().filter((s) => vocab.allergens.includes(s)),
  };
  return isEmptyDefaults(out) ? null : out;
}

/**
 * "Might this request be from a signed-in browser?" Presence of a Supabase auth cookie only, no verification:
 * the prefs only narrow what the visitor sees, they never reveal anything.
 */
export function hasSupabaseAuthCookie(names: readonly string[]): boolean {
  return names.some((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n));
}

/** A short stable fingerprint, so a page can tell whether its prefs match what the database now says. */
export function prefsHash(d: FoodDefaults | null | undefined): string {
  if (isEmptyDefaults(d)) return "none";
  const s = `${d!.diet.join(",")}|${d!.exclude.join(",")}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function humanJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * "vegetarian, no nuts" / "no gluten and dairy" / "vegan". Names come from the vocabulary (slug -> name);
 * an unknown slug falls back to the slug itself. Allergens read "no X" (never "free of" or "safe").
 */
export function prefsLabel(
  d: FoodDefaults,
  names: { diets?: ReadonlyMap<string, string>; allergens?: ReadonlyMap<string, string> } = {},
): string {
  const diets = d.diet.map((s) => (names.diets?.get(s) ?? s).toLowerCase());
  const allergens = d.exclude.map((s) => (names.allergens?.get(s) ?? s).toLowerCase());
  const parts = [...diets];
  if (allergens.length) parts.push(`no ${humanJoin(allergens)}`);
  return parts.join(", ");
}

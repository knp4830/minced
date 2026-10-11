"use server";

import { setFavorite, type FavoriteResult } from "@/lib/queries/favorites";

/** Slugs are lowercase words and hyphens; anything else is rejected before a query runs. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,150}$/;

export async function toggleFavorite(slug: string, on: boolean): Promise<FavoriteResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, reason: "not-found" };
  return setFavorite(slug, on === true);
}

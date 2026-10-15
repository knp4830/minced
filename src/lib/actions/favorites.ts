"use server";

import { setFavorite, type FavoriteResult } from "@/lib/queries/favorites";
import { SLUG_RE } from "@/lib/validate";

export async function toggleFavorite(slug: string, on: boolean): Promise<FavoriteResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, reason: "not-found" };
  return setFavorite(slug, on === true);
}

"use server";

import {
  getMyCookwareSlugs,
  MAX_OWNED_COOKWARE,
  setMyCookware,
  type SetCookwareResult,
} from "@/lib/queries/userCookware";

/** The signed-in cook's cookware, or `null` when signed out or unavailable. */
export async function loadMyCookware(): Promise<string[] | null> {
  try {
    return await getMyCookwareSlugs();
  } catch {
    return null;
  }
}

/** Replace the signed-in cook's cookware. Input is untrusted: shape-checked before any query. */
export async function saveMyCookware(slugs: string[]): Promise<SetCookwareResult> {
  if (!Array.isArray(slugs) || slugs.length > MAX_OWNED_COOKWARE) {
    return { ok: false, reason: "failed" };
  }
  return setMyCookware(slugs);
}

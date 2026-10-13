/**
 * Browser-side access to the SAVED fridge (signed-in users). Client-only.
 *
 * Signed-out visitors never touch this: their fridge is the URL plus
 * localStorage (src/lib/fridgeStorage.ts). Signed-in, the database is the
 * truth and the URL is the working view of it.
 */

import type { FridgeItem } from "@/lib/fridgeStorage";

export type SavedFridge = { items: FridgeItem[]; coverIds: number[] };

/** Fired on `window` after the saved fridge changes elsewhere on the page (an import, a dated edit). */
export const FRIDGE_CHANGED = "minced:fridge-changed";

/** The signed-in user's saved fridge, or null when the request failed (keep what you had). */
export async function fetchSavedFridge(): Promise<SavedFridge | null> {
  try {
    const res = await fetch("/api/fridge", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<SavedFridge> & { error?: boolean };
    if (body.error || !Array.isArray(body.items)) return null;
    return { items: body.items, coverIds: Array.isArray(body.coverIds) ? body.coverIds : [] };
  } catch {
    return null;
  }
}

export function announceFridgeChanged() {
  try {
    window.dispatchEvent(new Event(FRIDGE_CHANGED));
  } catch {
    /* no window: nothing is listening */
  }
}

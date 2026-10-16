"use client";

import { useEffect, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { fetchSavedFridge, type SavedFridge } from "@/lib/fridgeClient";
import { MAX_INT4 } from "@/lib/filters";

/** `?pantry=1,2,3` from the fridge results link, read after mount. Ids are clamped to int4. */
export function urlFridgeIds(): number[] {
  const raw = new URLSearchParams(window.location.search).get("pantry") ?? "";
  return raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_INT4);
}

// Components that mount together share one request instead of each calling /api/fridge.
let inflight: Promise<SavedFridge | null> | null = null;
function fetchSavedOnce(): Promise<SavedFridge | null> {
  if (!inflight) {
    inflight = fetchSavedFridge().finally(() => {
      setTimeout(() => {
        inflight = null;
      }, 0);
    });
  }
  return inflight;
}

/**
 * The fridge as the recipe page should see it: one answer for the have/missing marks and
 * the shopping box. Order: the link we arrived by (`?pantry=`), then (signed in) the
 * account's saved fridge. Signed out, the URL is the only source; localStorage is not read. Resolved after mount so the page itself stays static and cacheable.
 */
export function useFridgeIds(): { ids: ReadonlySet<number> | null; fromSaved: boolean } {
  const { status } = useAccount();
  const [state, setState] = useState<{ ids: ReadonlySet<number> | null; fromSaved: boolean }>({
    ids: null,
    fromSaved: false,
  });

  useEffect(() => {
    const fromUrl = urlFridgeIds();
    if (fromUrl.length > 0) {
      setState({ ids: new Set(fromUrl), fromSaved: false });
      return;
    }
    // Signed out (or not yet known): picks live in the URL only, so nothing is read from
    // this browser's old localStorage fridge, and a saved fridge from before sign-out is dropped.
    setState({ ids: null, fromSaved: false });
    if (status !== "in") return;
    let cancelled = false;
    void fetchSavedOnce().then((saved) => {
      if (cancelled || !saved || saved.items.length === 0) return;
      // coverIds already include each item's family (parent and variants).
      setState({ ids: new Set([...saved.items.map((i) => i.id), ...saved.coverIds]), fromSaved: true });
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return state;
}

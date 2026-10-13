"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const LAST_LIST_KEY = "minced:last-list";

/**
 * Renders nothing. Remembers the results page (search, filters, fridge matches)
 * in sessionStorage so a recipe page's back link can return to it. Storage can
 * be blocked, so every access is wrapped.
 */
export function RememberList() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_LIST_KEY, search ? `${pathname}?${search}` : pathname);
    } catch {
      /* private mode: the back link falls back to /recipes */
    }
  }, [pathname, search]);
  return null;
}

"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LAST_LIST_KEY } from "@/components/recipe/rememberList";

/**
 * "All recipes" that remembers where you came from. The page itself is cached
 * and the same for everyone, so the server HTML links to /recipes; after
 * mount, if this tab last looked at a results list (search, filters, fridge
 * matches), the link points back at exactly that list.
 */
export function BackToResults() {
  const [href, setHref] = useState("/recipes");
  useEffect(() => {
    try {
      const last = sessionStorage.getItem(LAST_LIST_KEY);
      if (last && /^\/(recipes|pantry)(\?|$)/.test(last)) setHref(last);
    } catch {
      /* blocked storage: keep /recipes */
    }
  }, []);
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-ink-muted hover:text-herb"
    >
      <ChevronLeft aria-hidden className="size-4" />
      {href.startsWith("/pantry") ? "Fridge matches" : "All recipes"}
    </Link>
  );
}

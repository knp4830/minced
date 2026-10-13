"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/*
 * Immediate feedback for navigations. Next's App Router keeps the old screen up
 * until the next one is ready, so a chip tap or a recipe link can look dead for
 * a few hundred milliseconds. This draws a thin bar across the top of the page
 * the instant a link is pressed (or code calls startNavProgress) and finishes
 * it when the URL changes. While it runs, <html data-nav-pending> is set so the
 * results area can dim (see globals.css).
 *
 * No router internals: it listens for clicks on same-origin links and for a
 * custom event, and it watches usePathname/useSearchParams for the end. A
 * timeout makes sure a navigation that never lands (offline, cancelled) cannot
 * leave the bar stuck.
 */

const START_EVENT = "minced:nav-start";
const GIVE_UP_MS = 12_000;

/** Call right before `router.push` / `router.replace` so programmatic navigations show the bar too. */
export function startNavProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function targetsNewPage(a: HTMLAnchorElement): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download") || a.dataset.noProgress !== undefined) return false;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Same page (even with a #hash): nothing to wait for.
  return url.pathname + url.search !== window.location.pathname + window.location.search;
}

type Phase = "idle" | "running" | "finishing";

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const giveUp = useRef<number | undefined>(undefined);
  const fade = useRef<number | undefined>(undefined);

  function set(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
    const root = document.documentElement;
    if (next === "running") root.setAttribute("data-nav-pending", "");
    else root.removeAttribute("data-nav-pending");
  }

  // Start: any plain internal link press, or an explicit call from code.
  useEffect(() => {
    function start() {
      window.clearTimeout(fade.current);
      window.clearTimeout(giveUp.current);
      set("running");
      giveUp.current = window.setTimeout(() => set("idle"), GIVE_UP_MS);
    }
    function onClick(e: MouseEvent) {
      if (!isPlainLeftClick(e)) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && targetsNewPage(a)) start();
    }
    document.addEventListener("click", onClick);
    window.addEventListener(START_EVENT, start);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener("popstate", start);
      window.clearTimeout(giveUp.current);
      window.clearTimeout(fade.current);
      document.documentElement.removeAttribute("data-nav-pending");
    };
  }, []);

  // End: the URL changed, so the new screen has committed.
  useEffect(() => {
    if (phaseRef.current !== "running") return;
    window.clearTimeout(giveUp.current);
    set("finishing");
    fade.current = window.setTimeout(() => set("idle"), 260);
  }, [pathname, search]);

  return (
    <div
      aria-hidden
      data-phase={phase}
      className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-[120] h-[3px]"
    />
  );
}

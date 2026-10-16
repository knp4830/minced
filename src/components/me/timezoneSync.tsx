"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { TZ_COOKIE, todayInZone } from "@/lib/me/dates";

/*
 * The server cannot know what day it is for you. It guesses from your last-known time zone (a cookie) or,
 * the first time, from UTC. This tells it the truth: if the browser's zone differs from the cookie, or the
 * browser's "today" differs from the date the server rendered, set the cookie and refresh once. A
 * sessionStorage guard keeps it from refreshing in a loop.
 */
export function TimezoneSync({ serverToday }: { serverToday: string }) {
  const router = useRouter();

  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;
    const have = document.cookie.split("; ").find((c) => c.startsWith(`${TZ_COOKIE}=`))?.split("=")[1];
    const localToday = todayInZone(zone);
    if (decodeURIComponent(have ?? "") === zone && localToday === serverToday) return;

    const marker = `${zone}|${localToday}`;
    try {
      if (window.sessionStorage.getItem("minced.me.tz-refresh") === marker) return;
      window.sessionStorage.setItem("minced.me.tz-refresh", marker);
    } catch {
      // no sessionStorage: refresh at most once per mount anyway
    }
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [serverToday, router]);

  return null;
}

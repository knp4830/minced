"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { hasAuthCookie, useAccount } from "@/components/account/accountProvider";
import { startNavProgress } from "@/components/shell/navProgress";
import { loadMyCookware, saveMyCookware } from "@/lib/actions/cookware";
import { cookwareUrl, readCookware, writeCookware } from "@/lib/cookwareStorage";

/*
 * The way back for "My cookware". Renders nothing; mount ONE per page.
 *
 *   - URL has the state  -> the URL wins, and is mirrored into localStorage
 *     (so a visit to /pantry after /recipes keeps it, like the fridge).
 *   - URL has nothing    -> restore: the account's list if signed in (or the
 *     device's list when the account has none yet, which is also saved to the
 *     account), otherwise the device's list. Then router.replace so the URL
 *     carries it and the results filter.
 *
 * `ownedOnly` is restored from the device only when a list is restored with it.
 */
export function CookwareSync({ owned, only }: { owned: string[]; only: boolean }) {
  const router = useRouter();
  const { status } = useAccount();
  const restored = useRef(false);
  const sawLoading = useRef(false);

  const key = `${owned.join(",")}|${only ? 1 : 0}`;
  useEffect(() => {
    if (owned.length > 0 || only) writeCookware({ slugs: owned, only });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers owned + only
  }, [key]);

  useEffect(() => {
    if (status === "loading") {
      sawLoading.current = true;
      return;
    }
    // The provider flips to "loading" in an effect that runs after ours; a cookie
    // with status "out" and no "loading" seen yet means "not decided yet".
    if (status === "out" && hasAuthCookie() && !sawLoading.current) return;
    if (restored.current) return;
    restored.current = true;
    if (owned.length > 0 || only) return;

    let cancelled = false;
    (async () => {
      const local = readCookware();
      let slugs = local.slugs;
      if (status === "in") {
        const mine = await loadMyCookware();
        if (mine && mine.length > 0) slugs = mine;
        else if (mine && slugs.length > 0) void saveMyCookware(slugs);
      }
      if (cancelled || slugs.length === 0) return;
      // The URL may have changed while the account answered.
      if (new URLSearchParams(window.location.search).has("ownedCookware")) return;
      const next = { slugs, only: local.only };
      writeCookware(next);
      startNavProgress();
      router.replace(cookwareUrl(next), { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the account state settles
  }, [status]);

  return null;
}

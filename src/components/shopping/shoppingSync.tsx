"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { importLocalShoppingList } from "@/lib/actions/shopping";
import { clearLocal, exportForImport, readLocalList } from "@/lib/shoppingStorage";

/**
 * Renders nothing. When someone signs in and this browser still holds a
 * signed-out shopping list, hands it to the account once and clears the local
 * copy. Mounted in the site layout so it happens on whichever page the
 * sign-in lands on, not only /shopping. If the hand-over fails the local list
 * is kept and tried again on the next navigation.
 */
export function ShoppingSync() {
  const { status } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    if (status !== "in" || running.current) return;
    const local = readLocalList();
    if (local.length === 0) return;
    running.current = true;
    (async () => {
      try {
        const kept = await importLocalShoppingList(exportForImport(local));
        if (kept !== null) {
          clearLocal();
          if (pathname.startsWith("/shopping")) router.refresh();
        }
      } catch {
        /* keep the local list; retried on the next navigation */
      } finally {
        running.current = false;
      }
    })();
  }, [status, pathname, router]);

  return null;
}

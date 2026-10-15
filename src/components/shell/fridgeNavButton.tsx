"use client";

import { CookingPot } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAccount } from "@/components/account/accountProvider";
import { OPEN_FRIDGE_PICKER } from "@/components/pantry/fridgePicker";
import { Button } from "@/components/ui/button";

/**
 * The header's fridge button. The door stays open to everyone. Signed in it
 * opens their saved fridge, which is where the dates live. Signed out it opens
 * the picker itself (with the "Sign in to save your fridge" note), so a first
 * visit is one tap to the checklist, not a page to read first.
 */
export function FridgeNavButton() {
  const { status, me } = useAccount();
  const pathname = usePathname();
  const saved = status === "in" && me;
  return (
    <Button asChild size="sm">
      <Link
        href={saved ? "/fridge" : "/pantry?pick=1"}
        onClick={(e) => {
          // Already on the picker page: a same-URL navigation does nothing, so ask it to open.
          if (!saved && pathname === "/pantry" && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
            e.preventDefault();
            window.dispatchEvent(new Event(OPEN_FRIDGE_PICKER));
          }
        }}
      >
        <CookingPot aria-hidden className="size-4" />
        {saved ? (
          <span>My fridge</span>
        ) : (
          <>
            <span className="hidden min-[420px]:inline">What’s in my fridge?</span>
            <span className="min-[420px]:hidden">My fridge</span>
          </>
        )}
      </Link>
    </Button>
  );
}

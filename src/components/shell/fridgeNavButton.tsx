"use client";

import { CookingPot } from "lucide-react";
import Link from "next/link";

import { useAccount } from "@/components/account/accountProvider";
import { Button } from "@/components/ui/button";

/**
 * The header's fridge button. Signed out (and in the cached server HTML) it
 * opens the picker page; once /api/me says the visitor is signed in it opens
 * their saved fridge, which is where the dates live.
 */
export function FridgeNavButton() {
  const { status, me } = useAccount();
  const saved = status === "in" && me;
  return (
    <Button asChild size="sm">
      <Link href={saved ? "/fridge" : "/pantry"}>
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

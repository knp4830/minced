"use client";

import { CookingPot } from "lucide-react";
import Link from "next/link";

import { useAccount } from "@/components/account/accountProvider";
import { Button } from "@/components/ui/button";

/**
 * The header's fridge entry, for signed-in people only (owner decision, wave 10c): a fridge lives in an
 * account. It opens "Cook from what you have", the grouped results for their saved fridge. Signed-out
 * visitors reach the explanation from the landing page and the footer instead of a button that promises
 * a feature they cannot use yet. Renders nothing while the session is still being checked, so the header
 * does not flash a button at someone about to be signed out.
 */
export function FridgeNavButton() {
  const { status, me } = useAccount();
  if (status !== "in" || !me) return null;
  return (
    <Button asChild size="sm">
      <Link href="/pantry">
        <CookingPot aria-hidden className="size-4" />
        <span>My fridge</span>
      </Link>
    </Button>
  );
}

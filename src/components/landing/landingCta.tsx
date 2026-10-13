"use client";

import Link from "next/link";

import { useAccount } from "@/components/account/accountProvider";
import { Button } from "@/components/ui/button";

/**
 * Closing band buttons. The page is cached for everyone, so the server HTML
 * says "Create an account"; signed-in visitors get their fridge and list instead.
 */
export function LandingCta() {
  const { status, me } = useAccount();
  const signedIn = status === "in" && me;
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {signedIn ? (
        <>
          <Button asChild variant="inverse" size="lg">
            <Link href="/fridge">Open my fridge</Link>
          </Button>
          <Button asChild variant="inverse-outline" size="lg">
            <Link href="/shopping">Shopping list</Link>
          </Button>
          <Button asChild variant="inverse-outline" size="lg">
            <Link href="/recipes">Browse recipes</Link>
          </Button>
        </>
      ) : (
        <>
          <Button asChild variant="inverse" size="lg">
            <Link href="/signup">Create an account</Link>
          </Button>
          <Button asChild variant="inverse-outline" size="lg">
            <Link href="/recipes">Browse recipes</Link>
          </Button>
        </>
      )}
    </div>
  );
}

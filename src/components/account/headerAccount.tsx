"use client";

import Link from "next/link";

import { useAccount } from "@/components/account/accountProvider";
import { cn } from "@/lib/utils";

/**
 * Header auth control. Signed out: "Log in / Sign up". Signed in: a 32px herb
 * circle with the person's initial, linking to /account (handoff "Global Nav").
 * The 44px tap target is the link; the circle is drawn inside it.
 *
 * Server HTML always says "Log in / Sign up" (the page is cached and the same
 * for everyone). If an auth cookie exists we hide it until /api/me answers, so
 * a signed-in person doesn't see the wrong control flash.
 */
export function HeaderAccount({ className }: { className?: string }) {
  const { status, me } = useAccount();

  if (status === "in" && me) {
    return (
      <Link
        href="/account"
        aria-label={`Your account, ${me.name}`}
        className={cn("group inline-flex min-h-11 min-w-11 items-center justify-center rounded-full", className)}
      >
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-herb font-sans text-[0.875rem] font-semibold text-on-herb transition-colors group-hover:bg-herb-deep"
        >
          {me.initial}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className={cn(
        "inline-flex min-h-11 items-center rounded-md px-2 text-[0.84375rem] font-medium whitespace-nowrap text-ink transition-colors hover:text-herb",
        status === "loading" && "opacity-0",
        className,
      )}
    >
      <span className="sm:hidden">Log in</span>
      <span className="hidden sm:inline">Log in / Sign up</span>
    </Link>
  );
}

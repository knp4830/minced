"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";

import { RecoverySearch } from "@/components/shell/recoverySearch";
import { Wordmark } from "@/components/shell/wordmark";
import { Button, buttonVariants } from "@/components/ui/button";

/*
 * The body of every "something went wrong" screen (each route group's error.tsx renders this). It says
 * what happened without blame, then gives four ways forward: try again, search, browse, go home.
 *
 * It never shows the error's message or stack, which can contain table names or SQL. The only thing
 * it surfaces is Next's `digest`, a short hash that matches the line in the server log, so a visitor
 * can quote it and the owner can find the cause.
 *
 * Keyboard and screen readers: focus moves to the heading when the screen appears (an error replaces
 * the page without a navigation, so otherwise focus is left on content that no longer exists), and the
 * heading is announced as the new context. `brand` adds the wordmark for layouts that have no header.
 */
export function ErrorView({
  error,
  reset,
  brand = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  brand?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();

  // reset() alone re-renders with the cached failed payload; the refresh refetches it first.
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="mx-auto max-w-[34rem] px-(--gutter) py-14 text-center md:py-20 xl:py-28">
      {/* Hoisted into <head> by React, so the tab and history say what happened. */}
      <title>Something went wrong</title>
      {brand && (
        <div className="mb-10 flex justify-center">
          <Wordmark className="text-[1.5rem]" />
        </div>
      )}
      <p className="label-mono mb-3 tracking-[0.1em]">A hiccup on our side</p>
      <h1 ref={heading} tabIndex={-1} className="text-[2rem] leading-[1.05] outline-none md:text-[2.5rem]">
        That didn&apos;t load
      </h1>
      <p className="mx-auto mt-3 max-w-[28em] text-[0.9375rem] leading-relaxed text-ink-muted">
        It isn&apos;t anything you did. Most of the time it clears up on its own, so try once more. If it keeps
        happening, give it a few minutes.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="md" onClick={retry}>
          Try again
        </Button>
        <Link href="/recipes" className={buttonVariants({ variant: "secondary", size: "md" })}>
          Browse recipes
        </Link>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
          Back to home
        </Link>
      </div>

      <RecoverySearch id="error-search" placeholder="Or search for a dish" />

      {error.digest && (
        <p className="mt-8 font-mono text-xs text-ink-subtle">
          If you write to us, mention reference <span className="select-all">{error.digest}</span>.
        </p>
      )}
    </div>
  );
}

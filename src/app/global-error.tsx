"use client";

import { useEffect, useRef } from "react";

import { buttonVariants } from "@/components/ui/button";
import "./globals.css";

/*
 * Last resort, used only when the root layout itself fails (a normal page error is caught by the nearer
 * error.tsx files). This replaces the whole document, so none of the layout's fonts, header or router
 * are available: it loads the colour tokens from globals.css (the fonts fall back to Georgia and the
 * system sans, as the CSS declares), and uses plain <a> links, which still work when client navigation
 * does not. Like the other error screens it never shows the error message, only the digest.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error);
    heading.current?.focus({ preventScroll: true });
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-16 text-center text-ink">
        <title>Something went wrong</title>
        <main id="main" className="max-w-[34rem]">
          <p className="mb-6 font-display text-[1.5rem] leading-none font-semibold tracking-[-0.02em]">Minced</p>
          <h1 ref={heading} tabIndex={-1} className="text-[2rem] leading-[1.05] outline-none md:text-[2.5rem]">
            That didn&apos;t load
          </h1>
          <p className="mx-auto mt-3 max-w-[28em] text-[0.9375rem] leading-relaxed text-ink-muted">
            It isn&apos;t anything you did. Most of the time it clears up on its own, so try once more. If it keeps
            happening, give it a few minutes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => reset()} className={buttonVariants({ variant: "primary", size: "md" })}>
              Try again
            </button>
            {/* Plain anchors on purpose: a full page load recovers from a broken client router. */}
            {/* eslint-disable @next/next/no-html-link-for-pages */}
            <a href="/recipes" className={buttonVariants({ variant: "secondary", size: "md" })}>
              Browse recipes
            </a>
            <a href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
              Back to home
            </a>
          </div>
          {error.digest && (
            <p className="mt-8 font-mono text-xs text-ink-subtle">
              If you write to us, mention reference <span className="select-all">{error.digest}</span>.
            </p>
          )}
        </main>
      </body>
    </html>
  );
}

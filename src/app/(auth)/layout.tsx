import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/shell/wordmark";

/* Log in / sign up: the logo, then the form. No nav, no marketing (handoff screen 7). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex w-full page-w items-center py-4 md:py-5">
        <Wordmark className="inline-flex min-h-11 items-center text-[1.5rem]" />
      </header>
      <main id="main" className="flex flex-1 flex-col justify-center px-(--gutter) pt-4 pb-12 md:pb-20">
        {/* A quiet card from tablet up, so the form reads as one object on a big, empty canvas. */}
        <div className="mx-auto w-full max-w-[380px] md:max-w-[26.5rem] md:rounded-xl md:border md:border-line md:bg-surface md:p-8">
          {children}
        </div>
      </main>
      <footer className="px-(--gutter) pb-6 text-center text-xs text-ink-subtle">
        <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 underline underline-offset-4 hover:text-herb">
          Privacy
        </Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center px-2 underline underline-offset-4 hover:text-herb">
          Terms
        </Link>
      </footer>
    </>
  );
}

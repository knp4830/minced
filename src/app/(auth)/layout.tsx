import Link from "next/link";
import type { ReactNode } from "react";

import { AuthBenefits } from "@/components/account/authPanel";
import { Wordmark } from "@/components/shell/wordmark";

/*
 * Full-page log in / sign up (direct loads and email links; everywhere else the
 * same screens open as a modal, see src/app/@modal). The logo, then the form in
 * a raised card, with what an account is for beside it from desktop up.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex w-full page-w items-center py-4 md:py-5">
        <Wordmark className="inline-flex min-h-11 items-center text-[1.5rem]" />
      </header>
      <main id="main" className="flex flex-1 items-center px-(--gutter) pt-4 pb-12 md:pb-20">
        <div className="mx-auto grid w-full max-w-[64rem] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_26.5rem] lg:gap-20">
          <div className="hidden lg:block">
            <p className="label-mono mb-4">Your kitchen, kept</p>
            <h2 className="mb-8 max-w-[14em] text-[2.25rem] leading-[1.08]">Find dinner fast. Keep what works.</h2>
            <AuthBenefits />
          </div>
          <div className="mx-auto w-full max-w-[380px] md:max-w-[26.5rem] md:rounded-2xl md:border md:border-line md:bg-surface md:p-8 md:shadow-frame">
            {children}
          </div>
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

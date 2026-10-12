import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/shell/wordmark";

/* Log in / sign up: the logo, then the form. No nav, no marketing (handoff screen 7). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-[1180px] items-center px-(--gutter) py-4 md:py-5">
        <Wordmark className="inline-flex min-h-11 items-center text-[1.5rem]" />
      </header>
      <main id="main" className="flex-1 px-(--gutter) pt-4 pb-12 md:pt-10">
        <div className="mx-auto w-full max-w-[380px]">{children}</div>
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

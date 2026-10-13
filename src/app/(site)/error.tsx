"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/* A page failed to load (usually the database is briefly unreachable). Keeps the site
   shell, says what happened, and offers a retry. */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[34rem] px-(--gutter) py-14 text-center md:py-20">
      <h1 className="text-[2rem] leading-[1.05] md:text-[2.5rem]">Something went wrong</h1>
      <p className="mx-auto mt-3 max-w-[28em] text-[0.9375rem] leading-relaxed text-ink-muted">
        We couldn&apos;t load this page. It is usually brief; try again in a moment.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="md" onClick={() => reset()}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
          Back to home
        </Link>
      </div>
    </div>
  );
}

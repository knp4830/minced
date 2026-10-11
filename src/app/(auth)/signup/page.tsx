import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/account/authForms";
import { buttonVariants } from "@/components/ui/button";
import { safeNext } from "@/lib/auth/validate";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignupPage({ searchParams }: Props) {
  const raw = (await searchParams).next;
  const rawNext = Array.isArray(raw) ? raw[0] : raw;
  const next = rawNext ? safeNext(rawNext) : undefined;
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <>
      <h1 className="text-[1.75rem] md:text-[2rem]">Create your account</h1>
      <p className="mt-1.5 mb-6 text-[0.9375rem] text-ink-muted">
        Save recipes to find them again. Just an email and a password.
      </p>

      <SignupForm next={next} />

      <div className="my-5 flex items-center gap-3 text-xs text-ink-subtle" aria-hidden>
        <span className="h-px flex-1 bg-line-strong" />
        or
        <span className="h-px flex-1 bg-line-strong" />
      </div>
      <Link href={`/login${nextQuery}`} className={buttonVariants({ variant: "secondary", size: "lg" }) + " w-full"}>
        I already have an account
      </Link>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/account/authForms";
import { buttonVariants } from "@/components/ui/button";
import { safeNext } from "@/lib/auth/validate";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawNext = one(sp.next);
  const next = rawNext ? safeNext(rawNext) : undefined;
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  const notice =
    one(sp.notice) === "deleted"
      ? "Your account is deleted. Your login and saved recipes are gone."
      : null;
  const linkError =
    one(sp.error) === "link" ? "That link has expired or was already used. Log in, or request a new one." : null;

  return (
    <>
      <h1 className="text-[1.75rem] md:text-[2rem]">Welcome back</h1>
      <p className="mt-1.5 mb-6 text-[0.9375rem] text-ink-muted">Log in to see your saved recipes.</p>

      {notice && (
        <p role="status" className="mb-4 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-[0.875rem] leading-snug">
          {notice}
        </p>
      )}
      {linkError && (
        <p role="alert" className="mb-4 rounded-lg border border-paprika/40 bg-paprika/5 px-3.5 py-2.5 text-[0.875rem] leading-snug text-paprika-deep">
          {linkError}
        </p>
      )}

      <LoginForm next={next} />

      <div className="my-5 flex items-center gap-3 text-xs text-ink-subtle" aria-hidden>
        <span className="h-px flex-1 bg-line-strong" />
        or
        <span className="h-px flex-1 bg-line-strong" />
      </div>
      <Link href={`/signup${nextQuery}`} className={buttonVariants({ variant: "secondary", size: "lg" }) + " w-full"}>
        Create an account
      </Link>
      <p className="mt-6 text-center text-[0.8125rem] text-ink-subtle">
        No newsletters. No 2,000-word intros. Just recipes.
      </p>
    </>
  );
}

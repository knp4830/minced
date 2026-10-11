import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/account/authForms";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-[1.75rem] md:text-[2rem]">Reset your password</h1>
      <p className="mt-1.5 mb-6 text-[0.9375rem] text-ink-muted">
        Enter your email and we&apos;ll send a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <Link
        href="/login"
        className="mt-4 inline-flex min-h-11 items-center text-[0.8125rem] text-ink-muted underline underline-offset-4 hover:text-herb"
      >
        Back to log in
      </Link>
    </>
  );
}

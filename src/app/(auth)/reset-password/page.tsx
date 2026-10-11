import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/account/authForms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
};

/** Reached from the reset email, which signs the person in for this one purpose. */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return (
    <>
      <h1 className="text-[1.75rem] md:text-[2rem]">Choose a new password</h1>
      <p className="mt-1.5 mb-6 text-[0.9375rem] text-ink-muted">You&apos;ll stay logged in afterwards.</p>
      <ResetPasswordForm />
    </>
  );
}

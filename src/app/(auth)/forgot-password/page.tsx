import type { Metadata } from "next";

import { AuthPanel } from "@/components/account/authPanel";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Forgot your password? Tell us your email and we will send a link to choose a new one.",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  return <AuthPanel view="forgot" searchParams={await searchParams} />;
}

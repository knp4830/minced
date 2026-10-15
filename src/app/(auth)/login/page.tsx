import type { Metadata } from "next";

import { AuthPanel } from "@/components/account/authPanel";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  return <AuthPanel view="login" searchParams={await searchParams} />;
}

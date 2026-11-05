import type { Metadata } from "next";

import { AuthPanel } from "@/components/account/authPanel";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Make a free Minced account to save a fridge, favourite recipes and keep a shopping list wherever you cook.",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignupPage({ searchParams }: Props) {
  return <AuthPanel view="signup" searchParams={await searchParams} />;
}

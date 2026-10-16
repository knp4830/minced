"use client";

import type { FormEvent, ReactNode } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { logOut } from "@/lib/actions/auth";

/**
 * Sign-out form. With JavaScript it signs out and resets the signed-in UI
 * directly; without, it falls back to the plain server action.
 */
export function SignOutForm({ children, className }: { children: ReactNode; className?: string }) {
  const { signOut } = useAccount();
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signOut();
  }
  return (
    <form action={logOut} onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}

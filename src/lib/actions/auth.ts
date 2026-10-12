"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  cleanEmail,
  safeNext,
  validateEmail,
  validateNewPassword,
} from "@/lib/auth/validate";
import { deleteMyAccount } from "@/lib/queries/account";
import { createClient } from "@/lib/supabase/server";

/*
 * Server actions for sign-up, log-in, log-out, password reset and account
 * deletion. Each takes the form's previous state first (React's
 * useActionState signature) and returns the next state; a successful log-in
 * or log-out never returns, it redirects.
 *
 * Messages are written so they never reveal whether an email has an account:
 * sign-up and reset always answer "check your email", log-in says the pair
 * doesn't match.
 */

export type FormState = {
  /** Shown above the form, in words. */
  error?: string;
  /** Per-field problems, keyed by input name. */
  fieldErrors?: Partial<Record<"email" | "password" | "confirm" | "agree", string>>;
  /** Success text; the form swaps itself for it. */
  done?: string;
  /** The email that was submitted, so a failed attempt doesn't clear it. */
  email?: string;
};

/** Absolute origin for links inside emails. Env wins; headers are the dev/preview fallback. */
async function siteOrigin(): Promise<string> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export async function logIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = cleanEmail(form.get("email"));
  const password = text(form, "password");
  const next = safeNext(text(form, "next"));

  const emailError = validateEmail(email);
  if (emailError) return { email, fieldErrors: { email: emailError } };
  if (!password) return { email, fieldErrors: { password: "Enter your password." } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        email,
        error: "Confirm your email first. The link we sent is in your inbox (check spam too).",
      };
    }
    if (error.status && error.status >= 500) {
      return { email, error: "Couldn't reach the server. Try again in a moment." };
    }
    return { email, error: "That email and password don't match." };
  }
  redirect(next);
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const email = cleanEmail(form.get("email"));
  const password = text(form, "password");
  const next = safeNext(text(form, "next"), "/account");

  const fieldErrors: FormState["fieldErrors"] = {};
  const emailError = validateEmail(email);
  if (emailError) fieldErrors.email = emailError;
  const passwordError = validateNewPassword(password);
  if (passwordError) fieldErrors.password = passwordError;
  if (form.get("agree") !== "on") {
    fieldErrors.agree = "Tick the box to agree to the Terms and Privacy Policy.";
  }
  if (Object.keys(fieldErrors).length) return { email, fieldErrors };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  // An already-confirmed address: some GoTrue versions answer 422 user_already_exists
  // instead of a silent success. Show the same neutral screen as a new address.
  if (error && (error.code === "user_already_exists" || error.code === "email_exists")) {
    return { email, done: "Check your email to continue." };
  }

  if (error) {
    if (error.code === "weak_password") {
      return { email, fieldErrors: { password: "Pick a stronger password." } };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { email, error: "Too many emails sent just now. Wait a few minutes and try again." };
    }
    return { email, error: "Couldn't create the account. Try again in a moment." };
  }

  // Confirmations off (local dev): a session came back, so the person is signed in.
  if (data.session) redirect(next);

  // Same answer whether or not the address already has an account: Supabase
  // answers a repeat sign-up with success and sends no confirmation, so any
  // wording that says "we sent a link" would be false for an existing account
  // and a tell for someone probing which emails are registered.
  return { email, done: "Check your email to continue." };
}

export async function requestPasswordReset(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = cleanEmail(form.get("email"));
  const emailError = validateEmail(email);
  if (emailError) return { email, fieldErrors: { email: emailError } };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.status === 429)) {
    return { email, error: "Too many emails sent just now. Wait a few minutes and try again." };
  }
  return {
    email,
    done: `If ${email} has an account, a reset link is on its way.`,
  };
}

export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = text(form, "password");
  const confirm = text(form, "confirm");

  const passwordError = validateNewPassword(password);
  if (passwordError) return { fieldErrors: { password: passwordError } };
  if (password !== confirm) return { fieldErrors: { confirm: "The two passwords don't match." } };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "That reset link has expired. Request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: "Pick a password you haven't used here before." } };
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: "Pick a stronger password." } };
    }
    return { error: "Couldn't change the password. Try again in a moment." };
  }
  redirect("/account?notice=password");
}

export async function logOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  if (text(form, "confirm").trim().toLowerCase() !== "delete") {
    return { fieldErrors: { confirm: "Type DELETE to confirm." } };
  }
  const ok = await deleteMyAccount();
  if (!ok) return { error: "Couldn't delete the account. Try again, or open an issue and we'll do it." };

  const supabase = await createClient();
  // The user row is gone, so the refresh token is dead; this just clears the cookies.
  await supabase.auth.signOut();
  redirect("/login?notice=deleted");
}

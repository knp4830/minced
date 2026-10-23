"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  cleanEmail,
  safeNext,
  validateEmail,
  validateNewPassword,
} from "@/lib/auth/validate";
import { GOOGLE_SIGNIN_ENABLED } from "@/lib/flags";
import { TZ_COOKIE } from "@/lib/me/dates";
import { PREFS_COOKIE } from "@/lib/prefs";
import { syncPrefsCookie } from "@/lib/prefsCookie";
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
        error:
          "Your email isn't confirmed yet. Open the link we sent when you signed up (it sometimes lands in spam or promotions).",
      };
    }
    if (error.status && error.status >= 500) {
      return { email, error: "We couldn't connect just now. Please try again in a moment." };
    }
    return { email, error: "That email and password don't match. Try again, or reset your password below." };
  }
  // Their saved diet / allergen defaults must apply from the very first list they open.
  await syncPrefsCookie(supabase);
  redirect(next);
}

/**
 * "Continue with Google": asks Supabase for the Google consent URL and sends the browser there.
 * A plain <form action>, so it works without JavaScript. The PKCE verifier cookie is set on
 * THIS host, which is why the callback must come back to the same host (see auth/callback).
 * `via=google` tells the callback which flow it is finishing so a failure says the right thing.
 * Google needs no password, and Supabase links the sign-in to an existing account with the same
 * verified email instead of making a duplicate.
 */
export async function signInWithGoogle(form: FormData): Promise<void> {
  const next = safeNext(text(form, "next"), "/account");
  const back = `/login?error=oauth${next === "/account" ? "" : `&next=${encodeURIComponent(next)}`}`;
  // The button is hidden while the flag is off, but a server action is a public endpoint.
  if (!GOOGLE_SIGNIN_ENABLED) redirect(back);

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?via=google&next=${encodeURIComponent(next)}`,
      // Only ever ask for who they are. No Gmail, Drive or contacts scopes.
      scopes: "openid email profile",
    },
  });
  if (error || !data.url) redirect(back);
  redirect(data.url);
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
    fieldErrors.agree = "Please tick the box to agree to the Terms and Privacy Policy.";
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
    return { email, done: "Look for an email from us to finish setting up your account." };
  }

  if (error) {
    if (error.code === "weak_password") {
      return { email, fieldErrors: { password: "That password is easy to guess. Try a longer one, or a few words strung together." } };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { email, error: "We've sent a lot of emails in the last few minutes. Please wait a little and try again." };
    }
    return { email, error: "Something went wrong creating your account. Please try again in a moment." };
  }

  // Confirmations off (local dev): a session came back, so the person is signed in.
  if (data.session) {
    await syncPrefsCookie(supabase);
    redirect(next);
  }

  // Same answer whether or not the address already has an account: Supabase
  // answers a repeat sign-up with success and sends no confirmation, so any
  // wording that says "we sent a link" would be false for an existing account
  // and a tell for someone probing which emails are registered.
  return { email, done: "Look for an email from us to finish setting up your account." };
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
    return { email, error: "We've sent a lot of emails in the last few minutes. Please wait a little and try again." };
  }
  return {
    email,
    done: `If there's an account for ${email}, a link to reset your password is on its way.`,
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
    return { error: "That reset link has expired. You can ask for a fresh one below." };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: "That's your current password. Pick a new one." } };
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: "That password is easy to guess. Try a longer one, or a few words strung together." } };
    }
    return { error: "We couldn't save your new password just now. Please try again in a moment." };
  }
  redirect("/account?notice=password");
}

/** Clears the session without redirecting; the client navigates itself (see SignOutForm). */
export async function logOutQuiet(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await forgetTimeZone();
}

/** The Me page's time-zone cookie and the saved-filters cookie are personal data: they go when the session does. */
async function forgetTimeZone(): Promise<void> {
  const jar = await cookies();
  jar.delete(TZ_COOKIE);
  jar.delete(PREFS_COOKIE);
}

export async function logOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await forgetTimeZone();
  redirect("/");
}

export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  if (text(form, "confirm").trim().toLowerCase() !== "delete") {
    return { fieldErrors: { confirm: "Type DELETE to confirm." } };
  }
  const ok = await deleteMyAccount();
  if (!ok) return { error: "We couldn't delete your account just now. Please try again, or open an issue and we'll do it for you." };

  const supabase = await createClient();
  // The user row is gone, so the refresh token is dead; this just clears the cookies.
  await supabase.auth.signOut();
  await forgetTimeZone();
  redirect("/login?notice=deleted");
}

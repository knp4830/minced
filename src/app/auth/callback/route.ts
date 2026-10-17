import type { EmailOtpType } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/validate";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = ["signup", "recovery", "email", "email_change", "invite", "magiclink"] as const;

/**
 * Where the links in Supabase's emails land (confirm sign-up, reset password).
 *
 * Two shapes are accepted:
 *  - `?code=`: the default PKCE link. Works only in the browser that asked for
 *    it, because the matching verifier cookie was set there.
 *  - `?token_hash=&type=`: the cross-device-safe link, if the email templates
 *    are changed to build it (see the hand-off notes). Works from any browser.
 *
 * Failure sends the person to /login with a message, never to a blank error.
 */
async function publicOrigin(): Promise<string> {
  // The session cookie was just set for the host that received this request, so
  // the redirect must go back to that same host (a preview deployment must not
  // bounce to production). NEXT_PUBLIC_SITE_URL is only the fallback. Never
  // `request.nextUrl.origin`: behind the proxy it is the internal address.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const local = host.startsWith("localhost") || host.startsWith("127.");
    const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (local ? "http" : "https");
    return `${proto}://${host}`;
  }
  const fixed = process.env.NEXT_PUBLIC_SITE_URL;
  return (fixed ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = await publicOrigin();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = (OTP_TYPES as readonly string[]).includes(rawType ?? "")
    ? (rawType as EmailOtpType)
    : null;
  const requested = safeNext(searchParams.get("next"), "/account");

  // `via=google` is set by signInWithGoogle. A Google failure gets its own message, because
  // "that link has expired" makes no sense to someone who never opened an email.
  const viaGoogle = searchParams.get("via") === "google";
  const failure = (reason: "link" | "oauth" | "oauth_cancelled") => {
    const qs = new URLSearchParams({ error: reason });
    if (requested !== "/account") qs.set("next", requested);
    return NextResponse.redirect(new URL(`/login?${qs}`, origin));
  };

  // The provider (or Supabase) reports its own failure as ?error=…&error_description=….
  // Only the machine code is looked at; the description is text we did not write, so it is
  // never echoed back into the page.
  const providerError = searchParams.get("error");
  if (providerError) {
    return failure(providerError === "access_denied" ? "oauth_cancelled" : "oauth");
  }

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) return failure(viaGoogle ? "oauth" : "link");

  const destination = type === "recovery" ? "/reset-password" : requested;
  return NextResponse.redirect(new URL(destination, origin));
}

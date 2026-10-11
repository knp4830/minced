import type { EmailOtpType } from "@supabase/supabase-js";
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
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = (OTP_TYPES as readonly string[]).includes(rawType ?? "")
    ? (rawType as EmailOtpType)
    : null;
  const requested = safeNext(searchParams.get("next"), "/account");

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=link", origin));

  const destination = type === "recovery" ? "/reset-password" : requested;
  return NextResponse.redirect(new URL(destination, origin));
}

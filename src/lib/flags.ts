/**
 * Feature flags. NEXT_PUBLIC_ so server and client agree; the value is inlined at build time,
 * so changing it needs a redeploy.
 *
 * User-created recipes (M5) are built and deployed but not connected: with the flag off there
 * is no link to them anywhere, the routes 404, and they are not in the sitemap.
 */
/** A flag is on when its value is "true" or "1". Pass the literal process.env.NEXT_PUBLIC_* read so the build can inline it. */
export function isOn(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

export const USER_RECIPES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_USER_RECIPES === "true";

/**
 * "Continue with Google" on the log-in and sign-up screens. Off until the Google OAuth client
 * exists and the provider is switched on in the Supabase dashboard (docs/setup/GOOGLE-SIGNIN.md);
 * with the flag on but the provider off, people would tap a button that can only fail.
 */
export const GOOGLE_SIGNIN_ENABLED = isOn(process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN);

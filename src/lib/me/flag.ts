/**
 * The Me dashboard is built but not connected. NEXT_PUBLIC_ENABLE_ME is inlined at build time (like the
 * user-recipes flag), so turning it on needs a redeploy. Off: /me shows a quiet "coming soon" page and the
 * recipe page's "Log this" button is hidden. Accepts "true" or "1".
 */
const raw = process.env.NEXT_PUBLIC_ENABLE_ME;
export const ME_ENABLED = raw === "true" || raw === "1";

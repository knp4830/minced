/**
 * The Me dashboard is built but not connected. NEXT_PUBLIC_ENABLE_ME is inlined at build time (like the
 * user-recipes flag), so turning it on needs a redeploy. Off: /me shows a quiet "coming soon" page and the
 * recipe page's "Log this" button is hidden.
 */
export const ME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ME === "true";

/**
 * Feature flags. NEXT_PUBLIC_ so server and client agree; the value is inlined at build time,
 * so changing it needs a redeploy.
 *
 * User-created recipes (M5) are built and deployed but not connected: with the flag off there
 * is no link to them anywhere, the routes 404, and they are not in the sitemap.
 */
export const USER_RECIPES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_USER_RECIPES === "true";

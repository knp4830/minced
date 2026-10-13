/* Browser Supabase client. Currently unused by the app (session reads go through /api/me); auth cookies are httpOnly, so it could not read them anyway. */

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Supabase client for **Client Components** (`"use client"`).
 *
 * Reads the session from `document.cookie`, so it only works where a browser
 * exists. Calling this during server rendering throws.
 *
 * Per CLAUDE.md, data fetching belongs in Server Components — reach for this
 * only for genuinely interactive things: realtime subscriptions, or an
 * autocomplete that must not round-trip to the server on every keystroke.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

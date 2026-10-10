import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Cookie-free Supabase client for pages that are cached (ISR / static).
 *
 * `server.ts` reads `cookies()`, which opts the whole route into per-request
 * rendering. A recipe page is identical for every visitor, so it must not touch
 * cookies at all, or "cache 978 pages" silently becomes "render 978 pages on
 * every hit". This client sends only the publishable key, so RLS shows exactly
 * what an anonymous visitor may read (published recipes).
 *
 * When accounts arrive, signed-in-only data (favourites) belongs in a client
 * component or a separate dynamic route, never in this client.
 */
export function createStaticClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Supabase client for **Server Components, Server Actions, and Route Handlers**.
 *
 * Must be awaited and must not be hoisted to module scope: `cookies()` is
 * request-scoped, so a client created once at import time would serve one
 * user's session to everybody. Create it inside the function that uses it.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              // No browser Supabase client exists, so nothing in the page needs to read the session.
              cookieStore.set(name, value, { ...options, httpOnly: true });
            }
          } catch {
            // Server Components cannot set cookies — only Server Actions and
            // Route Handlers can. This throws on a token refresh during render,
            // and swallowing it is correct: middleware refreshes the session on
            // the next request. Without the catch, every expiring session
            // crashes the page.
          }
        },
      },
    },
  );
}

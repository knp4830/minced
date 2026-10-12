import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

/**
 * Session refresh for the middleware. Returns the response to send (it carries
 * any refreshed auth cookies) and the verified user, if any.
 *
 * `getUser()` asks the Auth server to validate the token; `getSession()` only
 * decodes the cookie and can be forged. Anything that gates access uses this.
 *
 * Cookies written during refresh must be copied onto every response the
 * middleware returns, including redirects, or the browser keeps the stale
 * token and is signed out on the next request.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    user,
    response: () => response,
    /** A redirect that keeps the refreshed cookies. */
    redirect(url: URL) {
      const redirect = NextResponse.redirect(url);
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      return redirect;
    },
  };
}

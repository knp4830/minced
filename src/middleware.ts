import type { NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/validate";
import { updateSession } from "@/lib/supabase/middleware";

/*
 * Runs ONLY on the account and auth routes (see `matcher`). Recipe pages are
 * cached at the CDN and identical for everyone; running auth on them would add
 * a network call to every hit for no gain. The browser client refreshes its
 * own token while someone browses, and /account re-checks on the server.
 */
export async function middleware(request: NextRequest) {
  const session = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/account") && !session.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return session.redirect(url);
  }

  // Signed-out admins need a way in. Signed-in non-admins reach the layout,
  // which answers 404.
  if (pathname.startsWith("/admin") && !session.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return session.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/signup") && session.user) {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get("next"), "/account");
    url.search = "";
    return session.redirect(url);
  }

  return session.response();
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/login", "/signup", "/forgot-password", "/reset-password"],
};

import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/validate";
import { recipeExists } from "@/lib/recipeGate";
import { updateSession } from "@/lib/supabase/middleware";

/*
 * Runs on the account and auth routes (see `matcher`) and, with NO auth work, on
 * /recipes/<slug> to turn an unknown slug into a real 404. Recipe pages are
 * cached at the CDN and identical for everyone; running auth on them would add
 * a network call to every hit for no gain. The browser client refreshes its
 * own token while someone browses, and /account re-checks on the server.
 */
const RECIPE_PATH = /^\/recipes\/([^/]+)$/;

export async function middleware(request: NextRequest) {
  const { pathname: path } = request.nextUrl;
  const recipe = RECIPE_PATH.exec(path);
  if (recipe) {
    let slug = recipe[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* malformed escape: fails the slug check below */
    }
    if (await recipeExists(slug)) return NextResponse.next();
    return NextResponse.rewrite(new URL("/recipe-not-found", request.url), { status: 404 });
  }

  const session = await updateSession(request);
  const { pathname } = request.nextUrl;

  if ((pathname.startsWith("/account") || pathname.startsWith("/fridge")) && !session.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return session.redirect(url);
  }

  // /admin is deliberately not gated here: its layout answers 404 for signed-out
  // visitors and non-admins alike, so the route does not advertise itself.

  if ((pathname === "/login" || pathname === "/signup") && session.user) {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get("next"), "/account");
    url.search = "";
    return session.redirect(url);
  }

  return session.response();
}

export const config = {
  matcher: ["/recipes/:slug", "/account/:path*", "/fridge/:path*", "/admin/:path*", "/login", "/signup", "/forgot-password", "/reset-password"],
};

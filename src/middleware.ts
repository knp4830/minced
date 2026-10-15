import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/validate";
import { USER_RECIPES_ENABLED } from "@/lib/flags";
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
  // /recipes/new is the create form, not a slug. No recipe can have it as a slug (user
  // slugs end in a hash), so it falls through to the signed-in handling below.
  if (recipe && recipe[1] !== "new") {
    let slug = recipe[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* malformed escape: fails the slug check below */
    }
    if (await recipeExists(slug)) return NextResponse.next();
    return NextResponse.rewrite(new URL("/recipe-not-found", request.url), { status: 404 });
  }

  // With user recipes off, their routes answer a real 404 for everyone (signed in or not),
  // so the route does not advertise itself and the status is 404, not a streamed 200.
  if (!USER_RECIPES_ENABLED && (path === "/recipes/new" || /^\/recipes\/[^/]+\/edit$/.test(path))) {
    return NextResponse.rewrite(new URL("/recipe-not-found", request.url), { status: 404 });
  }

  const session = await updateSession(request);
  const { pathname } = request.nextUrl;

  const needsLogin =
    pathname.startsWith("/account") ||
    pathname.startsWith("/fridge") ||
    pathname === "/recipes/new" ||
    /^\/recipes\/[^/]+\/edit$/.test(pathname);
  if (needsLogin && !session.user) {
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
  matcher: ["/recipes/:slug", "/recipes/:slug/edit", "/account/:path*", "/fridge/:path*", "/admin/:path*", "/login", "/signup", "/forgot-password", "/reset-password"],
};

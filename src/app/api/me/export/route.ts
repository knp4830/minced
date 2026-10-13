import { getFavoriteSlugs } from "@/lib/queries/favorites";
import { getMyCookwareSlugs } from "@/lib/queries/userCookware";
import { createClient } from "@/lib/supabase/server";

/**
 * "Download my data": everything Minced stores about the signed-in person,
 * as a JSON file. Per person, so never cached. Signed-out callers get 401.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const [favorites, cookware] = await Promise.all([getFavoriteSlugs(), getMyCookwareSlugs()]);
  const body = {
    exported_at: new Date().toISOString(),
    email: user.email ?? null,
    account_created_at: user.created_at,
    saved_recipes: favorites,
    owned_cookware: cookware,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="minced-my-data.json"',
      "Cache-Control": "private, no-store",
    },
  });
}

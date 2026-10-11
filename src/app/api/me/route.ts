import { displayNameFor } from "@/lib/queries/account";
import { getFavoriteSlugs } from "@/lib/queries/favorites";
import { createClient } from "@/lib/supabase/server";

/**
 * Who is signed in, and which recipes they have saved. One small request the
 * whole site shares (see AccountProvider), so the cached pages (recipe detail,
 * browse) stay identical for everyone and the personal parts fill in on the
 * client. Never cached: the answer is per person.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ user: null, favorites: [] }, { headers: NO_STORE });

    const [profile, favorites] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      getFavoriteSlugs(),
    ]);
    const name = displayNameFor(user, profile.data?.display_name);
    return Response.json(
      { user: { name, initial: name.charAt(0).toUpperCase() || "?" }, favorites },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json({ user: null, favorites: [], error: true }, { status: 502, headers: NO_STORE });
  }
}

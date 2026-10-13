import { getCurrentUser } from "@/lib/queries/account";
import { getFavoriteSlugs } from "@/lib/queries/favorites";

/**
 * Who is signed in, and which recipes they have saved. One small request the
 * whole site shares (see AccountProvider), so the cached pages (recipe detail,
 * browse) stay identical for everyone and the personal parts fill in on the
 * client. Never cached: the answer is per person.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) return Response.json({ user: null, favorites: [] }, { headers: NO_STORE });
    const favorites = await getFavoriteSlugs();

    return Response.json(
      { user: { name: me.name, initial: me.initial }, favorites },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json({ user: null, favorites: [], error: true }, { status: 502, headers: NO_STORE });
  }
}

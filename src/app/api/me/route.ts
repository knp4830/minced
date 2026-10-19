import { getCurrentUser } from "@/lib/queries/account";
import { getFavoriteSlugs } from "@/lib/queries/favorites";
import { getMySettings } from "@/lib/queries/settings";
import { prefsHash } from "@/lib/prefs";
import { clearPrefsCookie, setPrefsCookie } from "@/lib/prefsCookie";
import { defaultsOf } from "@/lib/settingsValidate";

/**
 * Who is signed in, and which recipes they have saved. One small request the
 * whole site shares (see AccountProvider), so the cached pages (recipe detail,
 * browse) stay identical for everyone and the personal parts fill in on the
 * client. Never cached: the answer is per person.
 *
 * It also keeps the "prefs" cookie honest (see src/lib/prefs.ts): the database is the truth, the cookie is a
 * cache the list pages read. This is where drift between devices heals and where the 7-day expiry rolls, and
 * `prefsHash` lets an open /recipes or /pantry page notice that its defaults are out of date.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      await clearPrefsCookie();
      return Response.json({ user: null, favorites: [] }, { headers: NO_STORE });
    }
    const [favorites, settings] = await Promise.all([getFavoriteSlugs(), getMySettings()]);
    const defaults = defaultsOf(settings);
    await setPrefsCookie(me.id, defaults);

    return Response.json(
      {
        user: { name: me.name, initial: me.initial },
        favorites,
        prefsHash: prefsHash(defaults),
      },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json({ user: null, favorites: [], error: true }, { status: 502, headers: NO_STORE });
  }
}

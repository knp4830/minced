import { expandLegacyAllergens } from "@/lib/allergenSlugs";
import { getCurrentUser } from "@/lib/queries/account";
import { getMySettings } from "@/lib/queries/settings";

/**
 * The allergens the signed-in person saved in Settings, for the "Contains peanuts, which you avoid" notice on
 * recipe pages (src/components/recipe/avoidNotice.tsx). Recipe pages are cached and identical for everyone, so the
 * personal part is fetched by a small client island after load. Never cached: the answer is per person, and
 * signed-out visitors get an empty list.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) return Response.json({ allergens: [] }, { headers: NO_STORE });
    const settings = await getMySettings();
    return Response.json({ allergens: expandLegacyAllergens(settings.allergens) }, { headers: NO_STORE });
  } catch {
    return Response.json({ allergens: [], error: true }, { status: 502, headers: NO_STORE });
  }
}

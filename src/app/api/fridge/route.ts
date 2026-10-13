import { getFridgeIds } from "@/lib/queries/fridge";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's saved fridge as ids, for the client pieces that cannot
 * read the session themselves (the picker, the recipe page's have/missing
 * marks). Never cached: the answer is per person. Signed out is not an error,
 * just an empty fridge.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ items: [], coverIds: [] }, { headers: NO_STORE });
    return Response.json(await getFridgeIds(), { headers: NO_STORE });
  } catch {
    return Response.json({ items: [], coverIds: [], error: true }, { status: 502, headers: NO_STORE });
  }
}

import { getFavoriteSlugs } from "@/lib/queries/favorites";
import { getFridge } from "@/lib/queries/fridge";
import { getShoppingLines } from "@/lib/queries/shopping";
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
  const [favorites, cookware, fridge, shopping] = await Promise.all([
    getFavoriteSlugs(),
    getMyCookwareSlugs(),
    getFridge(),
    getShoppingLines(),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    email: user.email ?? null,
    account_created_at: user.created_at,
    saved_recipes: favorites,
    owned_cookware: cookware,
    fridge: fridge.map((f) => ({
      ingredient: f.name,
      aisle: f.aisle,
      purchased_on: f.purchasedOn,
      expires_on: f.expiresOn,
      amount: f.quantity,
      notes: f.notes,
    })),
    shopping_list: shopping.map((l) => ({
      ingredient: l.name,
      aisle: l.aisle,
      quantity: l.quantity,
      unit: l.unit,
      from_recipe: l.recipeTitle,
      checked: l.checked,
    })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="minced-my-data.json"',
      "Cache-Control": "private, no-store",
    },
  });
}

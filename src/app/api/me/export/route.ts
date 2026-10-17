import { getCurrentUser } from "@/lib/queries/account";
import { getFavoriteSlugs } from "@/lib/queries/favorites";
import { getFridge } from "@/lib/queries/fridge";
import { getShoppingLines } from "@/lib/queries/shopping";
import { getMyHealthExport } from "@/lib/queries/me";
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
  const [me, favorites, cookware, fridge, shopping, health] = await Promise.all([
    getCurrentUser(),
    getFavoriteSlugs(),
    getMyCookwareSlugs(),
    getFridge(),
    getShoppingLines(),
    getMyHealthExport(),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    email: user.email ?? null,
    display_name: me?.name ?? null,
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
    // The Me page. Empty (or null) when you have never used it.
    me_targets: health.targets,
    me_food_log: health.food_log,
    me_workouts: health.workouts,
    me_sleep: health.sleep,
    me_weights: health.weights,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="minced-my-data.json"',
      "Cache-Control": "private, no-store",
    },
  });
}

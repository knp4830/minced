// Times the Supabase calls behind each page, one by one, against whatever
// NEXT_PUBLIC_SUPABASE_URL points at (read-only GET / RPC reads).
//   node --env-file=.env.local scripts/perf/roundtrips.mjs
// Prints median ms of 5 runs. Never prints keys.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

const CARD =
  "id, slug, title, servings, total_time_min, calories, image_url, spice_level, source_name, cuisines(name), recipe_allergens(allergens(name)), has_photo, recipe_ingredients(sort_order, is_optional, ingredients(aisle_category, is_pantry_staple))";

async function time(label, fn, n = 5) {
  const ts = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    const { error } = await fn();
    if (error) throw new Error(`${label}: ${error.message}`);
    ts.push(performance.now() - t);
  }
  ts.sort((a, b) => a - b);
  console.log(`${label.padEnd(46)} median ${ts[Math.floor(n / 2)].toFixed(0)} ms  min ${ts[0].toFixed(0)}`);
}

await time("ping (cuisines limit 1)", () => sb.from("cuisines").select("id").limit(1));
const { data: first } = await sb
  .from("recipes")
  .select("id")
  .order("has_photo", { ascending: false })
  .order("title")
  .limit(24);
const ids = first.map((r) => r.id);
await time("browse page (cards + count exact)", () =>
  sb
    .from("recipes")
    .select(CARD, { count: "exact" })
    .order("has_photo", { ascending: false })
    .order("title")
    .order("id")
    .limit(25),
);
await time("browse page (cards, no count)", () =>
  sb
    .from("recipes")
    .select(CARD)
    .order("has_photo", { ascending: false })
    .order("title")
    .order("id")
    .limit(25),
);
await time("browse page + embedded photo", () =>
  sb
    .from("recipes")
    .select(CARD + ", recipe_photos(thumb_path, storage_path, credit, license)", { count: "exact" })
    .order("has_photo", { ascending: false })
    .order("title")
    .order("id")
    .limit(25),
);
await time("photos for 24 ids (separate query)", () =>
  sb.from("recipe_photos").select("recipe_id, storage_path, thumb_path, credit, license").in("recipe_id", ids),
);
await time("recipes count only (head)", () =>
  sb.from("recipes").select("id", { count: "exact", head: true }),
);
await time("match_recipes (2 ids)", () =>
  sb.rpc("match_recipes", { pantry_ids: [2358, 171], max_missing: 1000, must_use_ids: [], min_have: 1, page_size: 25 }),
);
await time("search_recipes chicken", () =>
  sb.rpc("search_recipes", { q: "chicken", result_limit: 25 }),
);
await time("ingredients names (2)", () => sb.from("ingredients").select("id, canonical_name").in("id", [2358, 171]));

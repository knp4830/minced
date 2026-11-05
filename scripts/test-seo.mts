// Run: node --experimental-strip-types scripts/test-seo.mts [rows.json]
// Plain asserts, no test runner. Part 1 (always): unit checks of the Recipe JSON-LD helper and pageMeta.
// Part 2 (when a rows file is given): feeds PostgREST-shaped recipe rows (from a throwaway snapshot, see
// docs/ARCHITECTURE.md SEO section) through mapRecipeRow -> recipeJsonLd and checks every result against
// Google's documented Recipe requirements.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SITE_URL = "https://minced.kevinpham.page";
register("./me-alias-hook.mjs", import.meta.url);

const J = await import("../src/lib/seo/recipeJsonLd.ts");
const M = await import("../src/lib/seo/meta.ts");
const D = await import("../src/lib/queries/recipeDetail.ts");

// ---- duration ----------------------------------------------------------------------------------------------------
assert.equal(J.isoDuration(45), "PT45M");
assert.equal(J.isoDuration(60), "PT1H");
assert.equal(J.isoDuration(90), "PT1H30M");
assert.equal(J.isoDuration(0), undefined, "0 means unknown, not zero minutes");
assert.equal(J.isoDuration(null), undefined);

// ---- pageMeta ----------------------------------------------------------------------------------------------------
const m = M.pageMeta({ title: "T", description: "D", path: "/x" });
assert.equal(m.alternates?.canonical, "/x");
assert.equal(m.openGraph?.siteName, "Minced");
assert.equal(m.openGraph?.title, "T");
assert.equal(m.openGraph?.description, "D");
assert.deepEqual(m.openGraph?.images, ["/og"], "no photo -> branded card");
assert.equal(m.twitter?.card, "summary_large_image");
assert.deepEqual(M.pageMeta({ title: "T", description: "D", path: "/x", image: "https://a/b.jpg" }).openGraph?.images, ["https://a/b.jpg"]);
assert.deepEqual(M.pageMeta({ title: "T", description: "D", path: "/", absoluteTitle: true }).title, { absolute: "T" });

// ---- Google Recipe requirements ----------------------------------------------------------------------------------
const ABS = /^https:\/\//;
const DUR = /^P(T(\d+H)?(\d+M)?)$/;
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export function checkRecipe(ld: Record<string, any>, ctx: { nutritionStatus: string | null }): { eligible: boolean; notes: string[] } {
  const notes: string[] = [];
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "Recipe");
  assert.ok(isStr(ld.name), "name");
  assert.ok(ABS.test(ld.url) && ld.url.startsWith("https://minced.kevinpham.page/recipes/"), "url on the production origin");
  assert.ok(isStr(ld.description), "description");
  // image: required by Google for the rich result; absolute https URLs only.
  const hasImage = Array.isArray(ld.image) && ld.image.length > 0;
  if (hasImage) for (const u of ld.image) assert.ok(ABS.test(u), `image absolute: ${u}`);
  else assert.equal(ld.image, undefined, "no empty image key");
  // author + publisher
  assert.ok(["Organization", "Person"].includes(ld.author?.["@type"]) && isStr(ld.author?.name), "author");
  assert.equal(ld.publisher?.name, "Minced");
  // times: ISO 8601, present only when known
  for (const k of ["prepTime", "cookTime", "totalTime"]) if (k in ld) assert.match(ld[k], DUR, k);
  // yield
  assert.ok(Array.isArray(ld.recipeYield) && ld.recipeYield.every(isStr), "recipeYield");
  // ingredients
  assert.ok(Array.isArray(ld.recipeIngredient) && ld.recipeIngredient.length > 0, "recipeIngredient");
  for (const line of ld.recipeIngredient) assert.ok(isStr(line) && !/\b(null|undefined|NaN)\b/.test(line), `ingredient line: ${line}`);
  // instructions: HowToStep with text
  assert.ok(Array.isArray(ld.recipeInstructions) && ld.recipeInstructions.length > 0, "recipeInstructions");
  ld.recipeInstructions.forEach((s: any, i: number) => {
    assert.equal(s["@type"], "HowToStep");
    assert.ok(isStr(s.text), "step text");
    assert.equal(s.position, i + 1);
  });
  // nutrition: only for trustworthy status; calories must be "<n> calories"
  if (ld.nutrition) {
    assert.equal(ld.nutrition["@type"], "NutritionInformation");
    assert.match(ld.nutrition.calories, /^\d+ calories$/);
    assert.ok(ctx.nutritionStatus === "complete" || ctx.nutritionStatus == null, `nutrition published for status ${ctx.nutritionStatus}`);
    for (const k of ["proteinContent", "carbohydrateContent", "fatContent", "fiberContent"]) if (k in ld.nutrition) assert.match(ld.nutrition[k], /^\d+ g$/);
    if ("sodiumContent" in ld.nutrition) assert.match(ld.nutrition.sodiumContent, /^\d+ mg$/);
  } else notes.push(`no nutrition (status ${ctx.nutritionStatus})`);
  // survives JSON and contains no raw "<" once escaped the way jsonLd.tsx does
  const escaped = JSON.stringify(ld).replace(/</g, "\\u003c");
  assert.ok(!escaped.includes("<"));
  assert.deepEqual(JSON.parse(escaped), ld, "round trip");
  if (!hasImage) notes.push("no image: valid markup, not rich-result eligible");
  return { eligible: hasImage, notes };
}

const rowsPath = process.argv[2];
if (rowsPath) {
  const rows = JSON.parse(readFileSync(rowsPath, "utf8")) as any[];
  let eligible = 0;
  for (const row of rows) {
    const recipe = D.mapRecipeRow(row);
    const status = row.nutrition_status ?? null;
    const ld = J.recipeJsonLd(recipe, { nutritionStatus: status });
    const { eligible: ok, notes } = checkRecipe(ld, { nutritionStatus: status });
    if (ok) eligible++;
    console.log(
      `${ok ? "rich " : "valid"} ${row.slug.padEnd(44)} ${String(row.source_name).slice(0, 14).padEnd(14)} author=${ld.author.name.slice(0, 12).padEnd(12)} ` +
        `total=${ld.totalTime ?? "-"} nut=${ld.nutrition ? "y" : "n"} ing=${ld.recipeIngredient.length} steps=${ld.recipeInstructions.length}${notes.length ? "  [" + notes.join("; ") + "]" : ""}`,
    );
  }
  console.log(`${rows.length} recipes checked, ${eligible} rich-result eligible`);
  // Spot-print one for the report.
  console.log(JSON.stringify(J.recipeJsonLd(D.mapRecipeRow(rows[0]), { nutritionStatus: rows[0].nutrition_status }), null, 1).slice(0, 1800));
}
console.log("seo tests ok");

// Run: node --experimental-strip-types scripts/test-label-coherence-10c.mts <label-inputs.json>
//   label-inputs.json comes from: psql "$URL" -At -f scripts/nutrition/export_label_inputs_10c.sql
// Builds the label for every published recipe with the real buildLabel() and checks that the label never contradicts
// itself: a part is never larger than its whole, a computed breakdown is never shown beside a published total it
// cannot fit inside, micronutrients on a partial recipe are marked "at least", and fats never appear under vitamins.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./me-alias-hook.mjs", import.meta.url);

const { buildLabel } = await import("../src/lib/recipeLabel.ts");
const { toNutrient, FDC } = await import("../src/lib/nutrients.ts");

const file = process.argv[2];
if (!file) {
  console.error("usage: test-label-coherence-10c.mts <label-inputs.json>");
  process.exit(2);
}
const doc = JSON.parse(readFileSync(file, "utf8"));
const nutrients = doc.nutrients.map(toNutrient);
const byId = new Map(nutrients.map((n: { id: number }) => [n.id, n]));

type Problem = { slug: string; what: string };
const problems: Problem[] = [];
const FAT_PARTS: number[] = [FDC.satFat, FDC.transFat, FDC.monoFat, FDC.polyFat];
let checked = 0;

for (const r of doc.recipes as any[]) {
  const data = {
    status: r.status,
    source: r.source,
    gaps: r.gaps ?? [],
    kcalDelta: r.kcal_delta === null ? null : Number(r.kcal_delta),
    rows: (r.rows ?? []).map((x: any) => ({ nutrient: byId.get(x.nutrient_id), amount: x.amount === null ? null : Number(x.amount), coverage: Number(x.coverage) })).filter((x: any) => x.nutrient),
  };
  const cols = {
    calories: r.cols.calories === null ? null : Number(r.cols.calories),
    proteinG: r.cols.proteinG === null ? null : Number(r.cols.proteinG),
    carbsG: r.cols.carbsG === null ? null : Number(r.cols.carbsG),
    fatG: r.cols.fatG === null ? null : Number(r.cols.fatG),
    fiberG: r.cols.fiberG === null ? null : Number(r.cols.fiberG),
    sodiumMg: r.cols.sodiumMg === null ? null : Number(r.cols.sodiumMg),
  };
  const m = buildLabel(cols, data.status ? data : null, nutrients);
  checked++;
  const top = new Map<number, any>(m.top.filter((x: any) => !x.noData && x.amount !== null).map((x: any) => [x.fdc, x]));
  const bad = (what: string) => problems.push({ slug: r.slug, what });
  const shown = (fdc: number) => (top.get(fdc)?.amount as number | undefined);

  const fat = shown(FDC.fat);
  if (fat !== undefined) {
    let sum = 0;
    for (const f of FAT_PARTS) {
      const v = shown(f);
      if (v === undefined) continue;
      sum += v;
      if (v > fat + 0.05) bad(`fat part ${f} (${v}) above total fat (${fat})`);
    }
    if (sum > fat + 0.5) bad(`fat parts add to ${sum.toFixed(1)} above total fat ${fat}`);
  }
  const carbs = shown(FDC.carbs);
  if (carbs !== undefined) {
    const sugars = shown(FDC.sugars);
    const fiber = shown(FDC.fiber);
    const added = shown(FDC.addedSugars);
    if (sugars !== undefined && sugars > carbs + 0.5) bad(`sugars ${sugars} above carbs ${carbs}`);
    if (fiber !== undefined && fiber > carbs + 0.5) bad(`fiber ${fiber} above carbs ${carbs}`);
    if (added !== undefined && sugars !== undefined && added > sugars + 0.5) bad(`added sugars ${added} above sugars ${sugars}`);
    if (added !== undefined && added > carbs + 0.5) bad(`added sugars ${added} above carbs ${carbs}`);
  }
  // fats and sugars never appear in the vitamins and minerals block
  for (const x of m.micro) {
    if (x.fdc !== null && ([...FAT_PARTS, FDC.sugars, FDC.addedSugars, FDC.fat, FDC.carbs, FDC.fiber, FDC.protein, FDC.sodium, FDC.cholesterol] as number[]).includes(x.fdc)) {
      bad(`macro nutrient ${x.name} listed under vitamins and minerals`);
    }
    if (/\b(mono|poly)unsaturated|trans fat|saturated fat/i.test(x.name)) bad(`${x.name} listed under vitamins and minerals`);
    if (m.partial && !x.noData && !x.atLeast) bad(`partial recipe: ${x.name} is not marked "at least"`);
  }
  for (const x of m.top) {
    if (m.partial && x.atLeast === false && !x.noData && x.fdc !== null && data.source === "computed" && x.fdc !== FDC.addedSugars && x.fdc !== null) {
      // computed value on a partial recipe must carry the marker
      bad(`partial computed recipe: ${x.name} is not marked "at least"`);
    }
  }
}

const byWhat = new Map<string, number>();
for (const p of problems) byWhat.set(p.what.replace(/[-\d.]+/g, "#").replace(/\([^)]*\)/g, ""), (byWhat.get(p.what.replace(/[-\d.]+/g, "#").replace(/\([^)]*\)/g, "")) ?? 0) + 1);
console.log(`labels checked: ${checked}, problems: ${problems.length}`);
for (const [k, v] of [...byWhat.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
for (const p of problems.slice(0, 12)) console.log(`    e.g. ${p.slug}: ${p.what}`);
assert.equal(problems.length, 0, `${problems.length} label coherence problems`);
console.log("test-label-coherence-10c: all labels coherent");

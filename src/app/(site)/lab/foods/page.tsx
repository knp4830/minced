import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/nutrients";
import { foodTitle } from "@/lib/foodTitle";
import { getFoodCounts, getFoodDetail, searchFoods, type FoodHit } from "@/lib/queries/foods";
import { getNutrients } from "@/lib/queries/recipeNutrients";

/*
 * Hidden QA page for the food database: search the same suggestions the type-ahead shows, and open any
 * USDA food to see every nutrient it reports per 100 g (and which it does not). noindex, not linked, not
 * in the sitemap, and a real 404 on the live site unless SHOW_LAB=1.
 */
export const metadata: Metadata = {
  title: "Foods (lab)",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const nf = new Intl.NumberFormat("en-US");

export default async function FoodsLab({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_LAB !== "1") notFound();
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 60);
  const fdc = Number(first(sp.fdc));

  const [counts, nutrients] = await Promise.all([getFoodCounts(), getNutrients()]);
  let hits: FoodHit[] = [];
  let searchFailed = false;
  if (q.trim().length >= 2) {
    try {
      hits = await searchFoods(q, 25);
    } catch {
      searchFailed = true;
    }
  }
  const detail = Number.isInteger(fdc) && fdc > 0 ? await getFoodDetail(fdc) : null;
  const reportedIds = new Set(detail?.nutrients.map((n) => n.nutrient.id));
  const missing = detail ? nutrients.filter((n) => !reportedIds.has(n.id)) : [];

  return (
    <main className="page-w pt-6 pb-10">
      <h1 className="text-[1.75rem] leading-tight">Foods (lab)</h1>
      <p className="mt-1 max-w-prose text-[0.875rem] text-ink-muted">
        QA view of the nutrition database. Not linked from the site.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Count label="USDA foods" v={counts.foods} />
        <Count label="Branded foods" v={counts.branded} />
        <Count label="Ingredients with a default food" v={counts.ingredientsWithFood} of={counts.ingredients} />
        <Count label="Nutrients defined" v={nutrients.length > 0 ? nutrients.length : null} />
      </dl>

      <form action="/lab/foods" method="get" className="mt-6 flex max-w-xl items-end gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="lab-q">Search</Label>
          <Input id="lab-q" name="q" type="search" defaultValue={q} placeholder="soy sauce, kikkoman, basmati" autoComplete="off" />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {searchFailed && <p className="mt-4 text-[0.875rem] text-paprika-deep">Search failed. Is the database reachable?</p>}
      {q.trim().length >= 2 && !searchFailed && (
        <section aria-labelledby="lab-hits" className="mt-6">
          <h2 id="lab-hits" className="label-mono">
            {hits.length} {hits.length === 1 ? "result" : "results"} for &ldquo;{q}&rdquo;
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.ingredientId}-${h.fdcId}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="text-[0.9375rem]">{h.kind === "food" ? foodTitle(h) : h.label}</span>{" "}
                  <span className="font-mono text-[0.6875rem] text-ink-muted">
                    {h.kind} · ingredient {h.ingredientId ?? "?"}
                    {h.fdcId !== null ? ` · fdc ${h.fdcId}` : ""}
                    {h.kcalPer100g !== null ? ` · ${nf.format(Math.round(h.kcalPer100g))} kcal/100 g` : ""}
                    {h.hasNutrition === false ? " · NO NUTRITION DATA" : ""}
                  </span>
                </span>
                {h.fdcId !== null && (
                  <a className="text-[0.8125rem] text-herb underline underline-offset-2" href={`/lab/foods?q=${encodeURIComponent(q)}&fdc=${h.fdcId}`}>
                    nutrients
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail && (
        <section aria-labelledby="lab-detail" className="mt-8">
          <h2 id="lab-detail" className="text-xl">
            {detail.description}
          </h2>
          <p className="mt-1 font-mono text-xs text-ink-muted">
            fdc {detail.fdcId} · {detail.dataType ?? "unknown type"}
            {detail.brandName ? ` · brand ${detail.brandName}` : ""}
            {detail.brandOwner ? ` · barcode owner ${detail.brandOwner}` : ""}
            {detail.servingSize !== null ? ` · serving ${detail.servingSize} ${detail.servingSizeUnit ?? ""}` : ""}
            {detail.household ? ` (${detail.household})` : ""}
          </p>
          <table className="mt-3 w-full max-w-xl border-collapse text-[0.875rem]">
            <caption className="sr-only">Nutrients per 100 grams</caption>
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1.5 font-semibold">
                  Nutrient
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Per 100 g
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.nutrients.map((n) => (
                <tr key={n.nutrient.id} className="border-b border-line">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {n.nutrient.name}
                  </th>
                  <td className="py-1.5 text-right font-mono">{formatAmount(n.per100g, n.nutrient)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {missing.length > 0 && (
            <p className="mt-3 max-w-xl text-[0.8125rem] text-ink-muted">
              Not reported by this food (unknown, not zero): {missing.map((n) => n.name).join(", ")}.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function Count({ label, v, of }: { label: string; v: number | null; of?: number | null }) {
  return (
    <div className="rounded-lg border border-line bg-band px-3 py-2.5">
      <dt className="text-[0.75rem] text-ink-muted">{label}</dt>
      <dd className="font-mono text-lg">
        {v === null ? "not loaded" : nf.format(v)}
        {of != null && v !== null ? <span className="text-[0.75rem] text-ink-muted"> of {nf.format(of)}</span> : null}
      </dd>
    </div>
  );
}

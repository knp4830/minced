import Link from "next/link";

import { AddFoodButton, RemoveFoodButton } from "@/components/me/meButtons";
import { MEALS, type DayTotals, type FoodEntry } from "@/lib/me/types";
import { usableImageUrl } from "@/lib/photos";

/*
 * "Today's meals": Breakfast, Lunch, Dinner, Snacks, each with what was logged and a "+ Add". A recipe
 * entry links back to its page; a quick add shows the name only. Calories on a row are the entry's total
 * (servings already applied).
 */

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function MealsPanel({ food, totals }: { food: FoodEntry[]; totals: DayTotals }) {
  const filled = MEALS.filter((m) => food.some((e) => e.meal === m.v)).length;
  return (
    <section aria-labelledby="me-meals-h" className="rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-mono">{filled} of 4 meals</p>
          <h2 id="me-meals-h" className="mt-1.5 text-xl leading-tight font-medium">
            Today&rsquo;s meals
          </h2>
        </div>
        <span className="pt-1 font-mono text-xs text-ink-muted">{nf.format(Math.round(totals.calories))} kcal logged</span>
      </div>

      <ul className="mt-2">
        {MEALS.map((m) => {
          const rows = food.filter((e) => e.meal === m.v);
          const kcal = rows.reduce((a, e) => a + e.calories, 0);
          return (
            <li key={m.v} className="border-t border-line py-3 md:py-3.5">
              <div className="flex min-h-8 items-center gap-3">
                <h3 className="font-display text-[0.9375rem] font-medium md:text-base">{m.label}</h3>
                {rows.length > 0 ? <span className="font-mono text-xs text-ink-muted">{nf.format(Math.round(kcal))} kcal</span> : <span className="text-xs text-ink-muted">Nothing logged yet</span>}
                <div className="flex-1" />
                <AddFoodButton meal={m.v} label={m.label} />
              </div>
              {rows.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-2">
                  {rows.map((e) => {
                    const img = usableImageUrl(e.recipe?.imageUrl);
                    return (
                      <li key={e.id} className="flex items-center gap-3">
                        {e.recipe ? (
                          <span className="relative size-10 shrink-0 overflow-hidden rounded-md border border-line bg-hatch" aria-hidden>
                            {img && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
                            )}
                          </span>
                        ) : (
                          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-band">
                            <span className="size-2.5 rounded-full border-[1.5px] border-ink-muted" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          {e.recipe ? (
                            <Link href={`/recipes/${e.recipe.slug}`} className="block truncate text-[0.8125rem] hover:text-herb hover:underline md:text-sm">
                              {e.name}
                            </Link>
                          ) : (
                            <div className="truncate text-[0.8125rem] md:text-sm">{e.name}</div>
                          )}
                          <div className={e.source === "recipe" ? "label-mono mt-1 text-herb" : "mt-1 font-mono text-[0.6875rem] text-ink-muted"}>
                            {e.source === "recipe" ? `Minced recipe · ${e.servings ?? 1} ${e.servings === 1 ? "serving" : "servings"}` : e.source === "food" ? "Ingredient or brand" : "Quick add"}
                          </div>
                        </div>
                        <span className="font-mono text-xs md:text-[0.8125rem]">{nf.format(Math.round(e.calories))}<span className="hidden sm:inline"> kcal</span></span>
                        <RemoveFoodButton id={e.id} name={e.name} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

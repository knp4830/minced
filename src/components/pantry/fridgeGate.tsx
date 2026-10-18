import Link from "next/link";

import { FridgePicker } from "@/components/pantry/fridgePicker";
import { buttonVariants } from "@/components/ui/button";
import type { IngredientCatalog } from "@/lib/queries/ingredientCatalog";
import { cn } from "@/lib/utils";

/**
 * What a signed-out visitor sees on /pantry and /fridge. A fridge is saved in an account (the database,
 * never the browser), so there is no tap-to-pick here; the page explains the feature, why it needs an
 * account, and offers the two ways forward. "Choose ingredients" stays open to everyone and builds the
 * Contains filter on /recipes.
 */
export const FRIDGE_GROUP_COPY = [
  ["Make now", "You have every ingredient the recipe needs."],
  ["Missing 1", "One thing short. Add it to your shopping list in a tap."],
  ["Missing 2", "Two things short."],
  ["Need a few more", "Three or more short. Tucked away until you want them."],
] as const;

export function FridgeGate({
  next,
  catalog,
  className,
}: {
  /** Where sign-in should return to. */
  next: "/pantry" | "/fridge";
  catalog: IngredientCatalog;
  className?: string;
}) {
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <div className={cn("page-w py-8 md:py-14", className)}>
      <div className="max-w-[40rem]">
        <p className="label-mono mb-3 text-herb">Cook from what you have</p>
        <h1 className="text-[1.875rem] leading-[1.05] md:text-[2.5rem]">
          Your fridge, ranked by what you can cook.
        </h1>
        <p className="mt-4 max-w-[34em] text-base leading-relaxed text-ink-muted">
          Save what’s in your fridge and Minced sorts every recipe by how little you’re missing. Salt, pepper, oil,
          butter, sugar, flour and water are assumed. It also puts recipes that use your soonest-to-expire food
          first.
        </p>
        <p className="mt-3 max-w-[34em] text-base leading-relaxed text-ink-muted">
          A fridge is yours, so it lives in your account and follows you from your laptop to your phone. Minced
          doesn’t keep it in your browser.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/signup${q}`} className={buttonVariants({ variant: "primary", size: "lg" })}>
            Create an account
          </Link>
          <Link href={`/login${q}`} className={buttonVariants({ variant: "secondary", size: "lg" })}>
            Log in
          </Link>
        </div>

        <section aria-labelledby="gate-groups-h" className="mt-10">
          <h2 id="gate-groups-h" className="label-mono mb-3">
            How your results are grouped
          </h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
            {FRIDGE_GROUP_COPY.map(([name, text]) => (
              <div key={name} className="contents">
                <dt className="font-semibold text-ink">{name}</dt>
                <dd className="text-[0.9375rem] leading-snug text-ink-muted sm:pb-0">{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="gate-choose-h" className="mt-10 border-t border-line pt-6">
          <h2 id="gate-choose-h" className="text-[1.0625rem]">
            Not ready for an account?
          </h2>
          <p className="mt-1 mb-3 max-w-[34em] text-[0.9375rem] leading-snug text-ink-muted">
            You can still find recipes that contain the ingredients you pick. Nothing is saved.
          </p>
          <FridgePicker variant="choose" catalog={catalog} />
        </section>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FridgeList } from "@/components/pantry/fridgeList";
import { FridgePicker } from "@/components/pantry/fridgePicker";
import { LocalFridgeImport } from "@/components/pantry/localFridgeImport";
import { buttonVariants } from "@/components/ui/button";
import { todayIso } from "@/lib/fridgeDates";
import { getCurrentUser } from "@/lib/queries/account";
import { getFridge } from "@/lib/queries/fridge";
import { getIngredientCatalog } from "@/lib/queries/ingredientCatalog";

export const metadata: Metadata = {
  title: "My fridge",
  description: "What you have, and what to cook first.",
  robots: { index: false },
};

/**
 * The saved fridge with dates. Signed-in only (the middleware sends everyone
 * else to log in; the check below is the real one). Reads the session, so it
 * is rendered per request and never cached.
 */
export default async function FridgePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Ffridge");

  const [rows, catalog] = await Promise.all([getFridge(), getIngredientCatalog()]);

  return (
    <div className="mx-auto max-w-[820px] px-(--gutter) py-8 md:py-12">
      <h1 className="text-[1.75rem] leading-[1.05] md:text-[2.25rem]">My fridge</h1>
      <p className="mt-2 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Everything you have, soonest to expire first. The dates are suggestions based on how long
        each kind of food usually keeps; change any of them to match what you bought.
      </p>

      <LocalFridgeImport className="mt-5" />

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1">
        <FridgePicker
          variant="manage"
          catalog={catalog}
          initial={rows.map((r) => ({ id: r.ingredientId, name: r.name }))}
        />
        <Link
          href="/pantry"
          className={buttonVariants({ variant: "ghost", size: "md" })}
        >
          See every recipe I can make
        </Link>
      </div>

      <div className="mt-6">
        <FridgeList initialRows={rows} serverToday={todayIso()} />
      </div>
    </div>
  );
}

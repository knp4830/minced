import type { Metadata } from "next";

import { ShoppingList } from "@/components/shopping/shoppingList";
import { getCurrentUser } from "@/lib/queries/account";
import { getShoppingLines } from "@/lib/queries/shopping";

export const metadata: Metadata = {
  title: "Shopping list",
  description: "Your shopping list: the ingredients you still need for the recipes you picked, grouped so the shop is quick.",
  robots: { index: false },
};

/*
 * Per-person page, so it is dynamic (it reads the session cookie) and never
 * cached. Signed in: the list comes from the database and is rendered here.
 * Signed out: an empty shell; the client reads the list from localStorage.
 */
export default async function ShoppingPage() {
  const user = await getCurrentUser();
  const lines = user ? await getShoppingLines() : [];

  return (
    <div className="page-w py-6 md:py-10">
      {/* The site header and footer have no place on a printed list. */}
      <style>{`@media print { header, footer { display: none !important } }`}</style>
      <h1 className="mb-1 text-[2rem] leading-tight tracking-[-0.02em]">Shopping list</h1>
      <p className="mb-5 text-[0.9375rem] text-ink-muted print:hidden">
        Grouped by aisle. Tap a row to tick it off.
      </p>
      <ShoppingList mode={user ? "account" : "local"} initial={lines} />
    </div>
  );
}

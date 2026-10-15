import { Plus } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { MyRecipeRow, RecipeStatus } from "@/lib/recipeForm";
import { cn } from "@/lib/utils";

/*
 * "My Recipe Book" on /account: the cook's own recipes in three states.
 * Server component, no JS. Drafts are private; "Pending review" is waiting for an
 * admin; "Published" is live. A recipe we sent back shows as a draft with a note.
 */

const PILL: Record<RecipeStatus | "returned", { label: string; className: string; dot?: boolean }> = {
  draft: { label: "Draft", className: "border-line-strong text-ink-muted" },
  in_review: { label: "Pending review", className: "border-saffron bg-saffron-tint text-saffron-ink", dot: true },
  published: { label: "Published", className: "border-line-strong bg-band text-ink" },
  returned: { label: "Sent back", className: "border-paprika/60 text-paprika-deep" },
};

function StatusPill({ row }: { row: MyRecipeRow }) {
  const p = PILL[row.returned ? "returned" : row.status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sheet border px-2.5 py-1 text-[0.75rem] font-semibold whitespace-nowrap",
        p.className,
      )}
    >
      {p.dot && <span aria-hidden className="size-1.5 rounded-full bg-saffron-ink" />}
      {p.label}
    </span>
  );
}

function meta(r: MyRecipeRow): string {
  const total = (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0);
  const parts = [`${r.ingredient_count} ingredient${r.ingredient_count === 1 ? "" : "s"}`, `${r.servings} srv`];
  if (total > 0) parts.unshift(`${total}m`);
  return parts.join(" · ");
}

export function MyRecipeBook({ recipes, notice }: { recipes: MyRecipeRow[]; notice: string | null }) {
  const flash: Record<string, string> = {
    submitted: "Submitted. We will review it before it appears on the site.",
    withdrawn: "Moved back to your drafts.",
    deleted: "Recipe deleted.",
  };
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 id="tab-h" className="flex items-baseline gap-3 text-xl">
          Your recipes
          <span className="font-mono text-[0.8125rem] font-normal text-ink-muted">private to you</span>
        </h2>
        <Link href="/recipes/new" className={cn(buttonVariants({ variant: "primary" }), "ml-auto")}>
          <Plus aria-hidden /> Create recipe
        </Link>
      </div>

      {notice && flash[notice] && (
        <p role="status" className="mb-4 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-[0.875rem]">
          {flash[notice]}
        </p>
      )}

      {recipes.length === 0 ? (
        <div className="max-w-md rounded-xl border border-line bg-surface px-6 py-8">
          <p className="text-[1.0625rem]">You have not written a recipe yet.</p>
          <p className="mt-1.5 text-[0.9375rem] text-ink-muted">
            Add ingredients with amounts and numbered steps. It stays private until we review it.
          </p>
          <Link href="/recipes/new" className={cn(buttonVariants({ variant: "primary" }), "mt-4")}>
            <Plus aria-hidden /> Create your first recipe
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {recipes.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 sm:px-4">
              <div
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-ph-sage font-display text-[1.5rem] font-semibold text-ph-sage-ink"
              >
                {r.title.trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 basis-48">
                <Link
                  href={`/recipes/${r.slug}/edit`}
                  className="block truncate text-[1.0625rem] font-semibold underline-offset-4 hover:text-herb hover:underline"
                >
                  {r.title}
                </Link>
                <p className="mt-0.5 font-mono text-[0.8125rem] text-ink-muted">{meta(r)}</p>
                {r.returned && r.review_note && (
                  <p className="mt-1 text-[0.8125rem] text-paprika-deep">Note from review: {r.review_note}</p>
                )}
              </div>
              <StatusPill row={r} />
              <span className="flex items-center gap-1">
                {r.status === "published" && (
                  <Link
                    href={`/recipes/${r.slug}`}
                    className="inline-flex min-h-11 items-center px-2.5 text-[0.875rem] font-medium text-ink-muted underline-offset-4 hover:text-herb hover:underline"
                  >
                    View
                  </Link>
                )}
                <Link
                  href={`/recipes/${r.slug}/edit`}
                  className="inline-flex min-h-11 items-center px-2.5 text-[0.875rem] font-semibold text-herb underline-offset-4 hover:underline"
                >
                  Edit<span className="sr-only">: {r.title}</span>
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setReview } from "@/lib/actions/adminReview";
import { SOURCE_LABEL, type ListRow, type ReviewState, type SourceKey } from "@/lib/adminReviewShared";
import { reviewHref } from "@/components/admin/reviewFilters";

/** Checkbox list for batch approve / reject. Rows open the one-per-screen view. */
export function BatchTable({ rows, state, source }: { rows: ListRow[]; state: ReviewState; source: SourceKey | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.slug));

  function toggle(slug: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  }

  function run(to: "approved" | "rejected" | "unreviewed") {
    const slugs = [...picked];
    if (slugs.length === 0) return;
    startTransition(async () => {
      const res = await setReview(slugs, to);
      if (!res.ok) {
        setMessage(res.reason === "forbidden" ? "Not allowed: your account is not an admin." : (res.message ?? "That did not save."));
        return;
      }
      setMessage(`${res.count ?? slugs.length} recipe${slugs.length === 1 ? "" : "s"} set to ${to}.`);
      setPicked(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line-strong bg-canvas py-2.5">
        <label className="flex min-h-11 items-center gap-2 text-[0.875rem]">
          <input
            type="checkbox"
            className="size-5 accent-herb"
            checked={allOn}
            onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.slug)))}
          />
          Select page
        </label>
        <Button size="sm" disabled={picked.size === 0 || pending} onClick={() => run("approved")}>
          Approve {picked.size || ""}
        </Button>
        <Button size="sm" variant="danger" disabled={picked.size === 0 || pending} onClick={() => run("rejected")}>
          Reject {picked.size || ""}
        </Button>
        <Button size="sm" variant="secondary" disabled={picked.size === 0 || pending} onClick={() => run("unreviewed")}>
          Reset
        </Button>
        <span role="status" aria-live="polite" className="text-[0.8125rem] text-ink-muted">
          {message}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.slug} className="flex items-center gap-3 py-1">
            <label className="flex size-11 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                className="size-5 accent-herb"
                checked={picked.has(r.slug)}
                onChange={() => toggle(r.slug)}
                aria-label={`Select ${r.title}`}
              />
            </label>
            <Link
              href={reviewHref("/admin/review", state, source, r.slug)}
              className="min-w-0 flex-1 py-2 hover:text-herb"
            >
              <span className="block truncate text-[0.9375rem] font-medium">{r.title}</span>
              <span className="block truncate font-mono text-[0.75rem] text-ink-muted">
                {SOURCE_LABEL[r.source_key as SourceKey] ?? r.source_key} &middot; {r.ingredient_count} ingredients
              </span>
            </Link>
            <span className="shrink-0 font-mono text-[0.75rem] text-ink-muted">{r.state}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-6 text-[0.9375rem] text-ink-muted">Nothing here.</li>}
      </ul>
    </div>
  );
}

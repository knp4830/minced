import Link from "next/link";

import { BatchTable } from "@/components/admin/batchTable";
import { ReviewHeader } from "@/components/admin/reviewFilters";
import { getProgress, getReviewList, parseSlug, parseSource, parseState, summarize } from "@/lib/queries/adminReview";

export const metadata = {
  title: "Batch review",
  description: "Approve many reviewed recipes at once.",
};

const PAGE = 50;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Keyset-paginated (by slug) list for batch approve. */
export default async function BatchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const state = parseState(sp.state);
  const source = parseSource(sp.source);
  const after = parseSlug(sp.after);

  const [progressRows, rows] = await Promise.all([getProgress(), getReviewList(state, source, after, PAGE + 1)]);
  const page = rows.slice(0, PAGE);
  const hasMore = rows.length > PAGE;
  const last = page[page.length - 1]?.slug;

  const q = new URLSearchParams();
  if (state !== "unreviewed") q.set("state", state);
  if (source) q.set("source", source);
  const withFilters = q.toString();
  const nextHref = last
    ? `/admin/review/list?${withFilters ? `${withFilters}&` : ""}after=${encodeURIComponent(last)}`
    : null;

  return (
    <div className="page-w space-y-5 py-5">
      <h1 className="text-[1.5rem] md:text-[1.75rem]">Batch review</h1>
      <ReviewHeader
        base="/admin/review/list"
        state={state}
        source={source}
        progress={summarize(progressRows, source)}
        overall={summarize(progressRows, null)}
      />
      <BatchTable key={`${state}|${source}|${after}`} rows={page} state={state} source={source} />
      <nav aria-label="Pages" className="flex gap-4 text-[0.875rem]">
        {after && (
          <Link className="font-medium text-herb underline" href={`/admin/review/list${withFilters ? `?${withFilters}` : ""}`}>
            Back to start
          </Link>
        )}
        {hasMore && nextHref && (
          <Link className="font-medium text-herb underline" href={nextHref}>
            Next {PAGE}
          </Link>
        )}
      </nav>
    </div>
  );
}

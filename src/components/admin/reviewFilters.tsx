import Link from "next/link";

import { Chip } from "@/components/ui/chip";
import {
  REVIEW_STATES,
  SOURCE_KEYS,
  SOURCE_LABEL,
  type ProgressSummary,
  type ReviewState,
  type SourceKey,
} from "@/lib/adminReviewShared";

const STATE_LABEL: Record<ReviewState, string> = {
  unreviewed: "Unreviewed",
  approved: "Approved",
  rejected: "Rejected",
  all: "All",
};

export function reviewHref(base: string, state: ReviewState, source: SourceKey | null, slug?: string | null) {
  const p = new URLSearchParams();
  if (state !== "unreviewed") p.set("state", state);
  if (source) p.set("source", source);
  if (slug) p.set("r", slug);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}

/** Progress count + bar + state/source filters. Server component: all links. */
export function ReviewHeader({
  base,
  state,
  source,
  progress,
  overall,
}: {
  base: string;
  state: ReviewState;
  source: SourceKey | null;
  progress: ProgressSummary;
  overall: ProgressSummary;
}) {
  const pct = overall.total ? Math.round((overall.reviewed / overall.total) * 100) : 0;
  return (
    <section aria-label="Review progress and filters" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-mono text-[0.9375rem] font-medium" data-testid="progress-count">
          {overall.reviewed} of {overall.total} reviewed
        </p>
        <p className="text-[0.8125rem] text-ink-muted">
          {overall.approved} approved, {overall.rejected} rejected, {overall.unreviewed} to go
          {source && (
            <>
              {" "}
              &middot; {SOURCE_LABEL[source]}: {progress.reviewed} of {progress.total}
            </>
          )}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Recipes reviewed"
        aria-valuemin={0}
        aria-valuemax={overall.total}
        aria-valuenow={overall.reviewed}
        className="h-2 overflow-hidden rounded-full bg-track"
      >
        <div className="h-full bg-herb" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Review state">
          {REVIEW_STATES.map((s) => (
            <Chip key={s} asChild selected={s === state}>
              <Link href={reviewHref(base, s, source)} prefetch={false}>
                {STATE_LABEL[s]}
              </Link>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Source">
          <Chip asChild selected={source === null}>
            <Link href={reviewHref(base, state, null)} prefetch={false}>
              Any source
            </Link>
          </Chip>
          {SOURCE_KEYS.map((k) => (
            <Chip key={k} asChild selected={k === source}>
              <Link href={reviewHref(base, state, k)} prefetch={false}>
                {SOURCE_LABEL[k]}
              </Link>
            </Chip>
          ))}
        </div>
      </div>
    </section>
  );
}

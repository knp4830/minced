import { MeSkeleton } from "@/components/shell/pageSkeletons";
import { Bar } from "@/components/shell/skeletons";
import { ME_ENABLED } from "@/lib/me/flag";

/* With the dashboard switched off, /me is a quiet coming-soon page: only its title is waiting. */
export default function Loading() {
  if (ME_ENABLED) return <MeSkeleton />;
  return (
    <div role="status" aria-label="Loading" className="page-w py-8 md:py-12">
      <span className="sr-only">Loading…</span>
      <Bar className="h-8 w-14 md:h-10" />
    </div>
  );
}

import Link from "next/link";

import { ReviewHeader, reviewHref } from "@/components/admin/reviewFilters";
import { ReviewScreen } from "@/components/admin/reviewScreen";
import {
  getFirstSlug,
  getNeighbors,
  getProgress,
  getRecipeDetail,
  parseSlug,
  parseSource,
  parseState,
  summarize,
} from "@/lib/queries/adminReview";
import { photoPublicUrl } from "@/lib/photos";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const state = parseState(sp.state);
  const source = parseSource(sp.source);
  const requested = parseSlug(sp.r);

  const progressRows = await getProgress();
  const overall = summarize(progressRows, null);
  const scoped = summarize(progressRows, source);
  const slug = requested ?? (await getFirstSlug(state, source));

  const header = (
    <ReviewHeader base="/admin/review" state={state} source={source} progress={scoped} overall={overall} />
  );

  if (!slug) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-8 px-(--gutter) py-6">
        {header}
        <p className="rounded-xl border border-line-strong bg-surface p-6 text-[0.9375rem]">
          Nothing in this view.{" "}
          {state === "unreviewed" ? "Every recipe here has been reviewed." : "Try another filter."}{" "}
          <Link className="font-medium text-herb underline" href={reviewHref("/admin/review", "all", source)}>
            Show all
          </Link>
        </p>
      </div>
    );
  }

  const [recipe, neighbors] = await Promise.all([getRecipeDetail(slug), getNeighbors(slug, state, source)]);

  if (!recipe) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-8 px-(--gutter) py-6">
        {header}
        <p role="alert" className="rounded-xl border border-line-strong bg-surface p-6 text-[0.9375rem]">
          No imported recipe called <span className="font-mono">{slug}</span>.{" "}
          <Link className="font-medium text-herb underline" href={reviewHref("/admin/review", state, source)}>
            Back to the queue
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] px-(--gutter) pt-5 pb-28 md:pb-10">
      {header}
      <ReviewScreen
        recipe={recipe}
        state={state}
        source={source}
        prev={neighbors.prev_slug}
        next={neighbors.next_slug}
        total={Number(neighbors.total)}
        photoUrl={recipe.photo ? photoPublicUrl(recipe.photo.storage_path) : null}
      />
    </div>
  );
}

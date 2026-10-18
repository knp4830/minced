import Link from "next/link";

import { MissingAdder } from "@/components/pantry/missingAdder";
import { RecipeCard, type RecipeCardProps } from "@/components/recipe/recipeCard";
import { buttonVariants } from "@/components/ui/button";
import {
  filtersToQuery,
  hasActiveFilters,
  withFilters,
  type DefaultsState,
  type RecipeFilters,
} from "@/lib/filters";
import { daysUntil, daysUntilLabel, SOON_WITHIN_DAYS, todayIso, urgencyOf } from "@/lib/fridgeDates";
import { getCardExtras } from "@/lib/queries/browse";
import {
  FRIDGE_GROUPS,
  fridgeGroupPage,
  fridgeGroups,
  type FridgeGroupId,
  type FridgeGroupPage,
  type FridgeMatch,
  type SoonItem,
} from "@/lib/queries/fridgeMatcher";
import type { FridgeRow } from "@/lib/queries/fridge";
import { usableImageUrl } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * The fridge door's results (wave 10c): grouped by how much is missing.
 *
 *   Make now          every required ingredient is on hand
 *   Missing 1 / 2     one or two short, each with a one-tap "add to shopping list"
 *   Need a few more   three or more short, collapsed
 *
 * Inside a group the recipes that use the soonest-expiring fridge items come first. Staples are assumed
 * and said so. Server component; it waits on the matcher, so the page keeps it inside a keyed <Suspense>.
 */

export const GROUP_LABEL: Record<FridgeGroupId, string> = {
  now: "Make now",
  missing1: "Missing 1",
  missing2: "Missing 2",
  more: "Need a few more",
};

const GROUP_HINT: Record<FridgeGroupId, string> = {
  now: "You have everything these need.",
  missing1: "One ingredient short.",
  missing2: "Two ingredients short.",
  more: "Three or more short.",
};

export function isGroupId(v: string | undefined): v is FridgeGroupId {
  return v === "now" || v === "missing1" || v === "missing2" || v === "more";
}

/** The saved fridge items due within a few days, as the matcher wants them (past-date items included). */
export function soonItems(rows: FridgeRow[], today: string): SoonItem[] {
  return rows.flatMap((r) => {
    if (!r.expiresOn) return [];
    const days = daysUntil(r.expiresOn, today);
    return days <= SOON_WITHIN_DAYS ? [{ id: r.ingredientId, days }] : [];
  });
}

type Extras = Awaited<ReturnType<typeof getCardExtras>>;

function cardProps(m: FridgeMatch, extras: Extras, withCoverage: boolean): RecipeCardProps {
  const day = m.soonDay;
  return {
    ...extras[m.recipeId],
    slug: m.slug,
    title: m.title,
    imageUrl: extras[m.recipeId]?.imageUrl ?? usableImageUrl(m.imageUrl),
    totalTimeMin: m.totalTimeMin,
    servings: m.servings,
    calories: m.calories,
    coverage: withCoverage
      ? { haveCount: m.haveCount, neededCount: m.neededCount, missingNames: m.missingNames }
      : undefined,
    useFirst:
      day !== null && day <= SOON_WITHIN_DAYS
        ? {
            label: `Uses something ${daysUntilLabel(day)}`,
            urgent: ["expired", "urgent"].includes(urgencyOf(day)),
          }
        : undefined,
  };
}

function CardGrid({
  matches,
  extras,
  group,
  firstPriority,
}: {
  matches: FridgeMatch[];
  extras: Extras;
  group: FridgeGroupId;
  firstPriority?: boolean;
}) {
  return (
    <ul
      aria-label={GROUP_LABEL[group]}
      className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))] sm:gap-[18px]"
    >
      {matches.map((m, i) => (
        <li key={m.slug} className="flex min-w-0 flex-col gap-2">
          <RecipeCard
            {...cardProps(m, extras, group === "now")}
            priority={firstPriority && i < 2}
          />
          {group !== "now" && (
            <MissingAdder
              slug={m.slug}
              have={m.haveCount}
              needed={m.neededCount}
              missing={m.missingIds.map((id, n) => ({ id, name: m.missingNames[n] ?? "" })).filter((x) => x.name)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function GroupHeading({ group, total, id }: { group: FridgeGroupId; total: number; id: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id={id} className="text-lg md:text-xl">
        {GROUP_LABEL[group]}
        <span className="ml-2 font-mono text-[0.8125rem] font-normal text-ink-muted">
          <span className="sr-only">, </span>
          {total}
        </span>
      </h2>
      <p className="text-[0.8125rem] text-ink-muted">{GROUP_HINT[group]}</p>
    </div>
  );
}

export async function FridgeResults({
  filters,
  urlFilters,
  defaults,
  rows,
  group,
}: {
  /** What is queried: the URL's filters with the saved diet / allergen defaults merged in. */
  filters: RecipeFilters;
  /** What the address bar says; every link we build keeps this, never the defaults. */
  urlFilters: RecipeFilters;
  defaults: DefaultsState;
  rows: FridgeRow[];
  /** Set when one group is shown on its own (a "Show all" link, or the "only what I can make now" switch). */
  group: FridgeGroupId | null;
}) {
  const today = todayIso();
  const pantryIds = rows.map((r) => r.ingredientId);
  const soon = soonItems(rows, today);
  const nowOnly = filters.now === true;
  const single: FridgeGroupId | null = nowOnly ? "now" : group;
  const base = `/pantry${filtersToQuery(withFilters(urlFilters, { cursor: undefined }))}`;
  const joiner = base.includes("?") ? "&" : "?";

  const empty = (
    <div>
      <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        {hasActiveFilters(filters) || defaults.applied
          ? defaults.applied
            ? "None of the recipes fit these filters and your defaults. Turn off your defaults, add something else to the fridge, or loosen a filter."
            : "None of the recipes fit these filters. Try adding something else to the fridge, or loosen a filter."
          : "No recipe uses what is in your fridge yet. Add a few more things and check again."}
      </p>
      {defaults.applied && (
        <Link
          href={`/pantry${filtersToQuery(withFilters(urlFilters, { defaults: "off" }))}`}
          scroll={false}
          className={cn(buttonVariants({ variant: "primary", size: "md" }), "mt-4")}
        >
          Turn off my defaults
        </Link>
      )}
    </div>
  );

  // ---- one group on its own, keyset-paginated -------------------------------------------------
  if (single) {
    const page = await fridgeGroupPage(filters, pantryIds, soon, single, 24);
    const extras = await getCardExtras(page.matches.map((m) => m.recipeId));
    // The query always holds the cursor here, so `group` is appended with "&".
    const nextHref = page.nextCursor
      ? `/pantry${filtersToQuery(withFilters(urlFilters, { cursor: page.nextCursor }))}${nowOnly ? "" : `&group=${single}`}`
      : null;
    if (page.matches.length === 0 && !filters.cursor) {
      return nowOnly ? (
        <div>
          <GroupHeading group="now" total={0} id="results-heading" />
          <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
            Nothing you can make right now. Turn off “Only what I can make now” to see recipes that are one or two
            ingredients away.
          </p>
        </div>
      ) : (
        empty
      );
    }
    return (
      <section aria-labelledby="results-heading">
        <GroupHeading group={single} total={page.total} id="results-heading" />
        {!nowOnly && (
          <p className="mb-4">
            <Link
              href={base}
              className="inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4 hover:text-herb"
            >
              Back to all groups
            </Link>
          </p>
        )}
        <CardGrid matches={page.matches} extras={extras} group={single} firstPriority />
        {nextHref && (
          <div className="mt-8 flex justify-center">
            <Link href={nextHref} className={buttonVariants({ variant: "secondary" })}>
              Show more
            </Link>
          </div>
        )}
      </section>
    );
  }

  // ---- all four groups ------------------------------------------------------------------------
  const groups = await fridgeGroups(filters, pantryIds, soon, 12);
  const anyRows = FRIDGE_GROUPS.some((g) => groups[g].total > 0);
  if (!anyRows) return empty;
  const extras = await getCardExtras(
    FRIDGE_GROUPS.flatMap((g) => groups[g].matches.map((m) => m.recipeId)),
  );
  const showAll = (g: FridgeGroupId, page: FridgeGroupPage) =>
    page.total > page.matches.length ? (
      <p className="mt-5">
        <Link
          href={`${base}${joiner}group=${g}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4 hover:text-herb"
        >
          Show all {page.total} in “{GROUP_LABEL[g]}”
        </Link>
      </p>
    ) : null;

  let firstShown = true;
  return (
    <div className="flex flex-col gap-10">
      {(["now", "missing1", "missing2"] as const).map((g) => {
        const page = groups[g];
        const headId = `group-${g}`;
        const first = firstShown && page.matches.length > 0;
        if (first) firstShown = false;
        return (
          <section key={g} aria-labelledby={headId} data-group={g}>
            <GroupHeading group={g} total={page.total} id={headId} />
            {page.matches.length > 0 ? (
              <>
                <CardGrid matches={page.matches} extras={extras} group={g} firstPriority={first} />
                {showAll(g, page)}
              </>
            ) : (
              <p className="text-[0.9375rem] text-ink-muted">
                {g === "now"
                  ? "Nothing you can make right now. The recipes below are one or two ingredients away."
                  : "None."}
              </p>
            )}
          </section>
        );
      })}

      {groups.more.total > 0 && (
        <details className="group/more rounded-xl border border-line bg-surface/60" data-group="more">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="text-lg md:text-xl">
              {GROUP_LABEL.more}
              <span className="ml-2 font-mono text-[0.8125rem] font-normal text-ink-muted">
                <span className="sr-only">, </span>
                {groups.more.total}
              </span>
            </span>
            <span className="text-[0.8125rem] text-ink-muted">
              <span className="group-open/more:hidden">Show</span>
              <span className="hidden group-open/more:inline">Hide</span>
            </span>
          </summary>
          <div className="px-4 pt-2 pb-5">
            <p className="mb-4 text-[0.8125rem] text-ink-muted">{GROUP_HINT.more}</p>
            <CardGrid matches={groups.more.matches} extras={extras} group="more" />
            {showAll("more", groups.more)}
          </div>
        </details>
      )}
    </div>
  );
}

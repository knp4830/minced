import Link from "next/link";
import { Card, CardBody, CardMedia, CardTitle } from "@/components/ui/card";
import { MetaRow } from "@/components/ui/metaRow";

/**
 * Pantry-door slot. Present only on matcher results; search results omit it.
 * `missingNames` are canonical names, already alphabetical (match_recipes).
 */
export type RecipeCardCoverage = {
  haveCount: number;
  neededCount: number;
  missingNames: string[];
};

export type RecipeCardProps = {
  slug: string;
  title: string;
  /** Cuisine display name. Null for most imported recipes (see CLAUDE.md gaps). */
  cuisine?: string | null;
  imageUrl?: string | null;
  /** Required by CC BY / CC BY-SA photos; shown over the image corner. */
  photoCredit?: string | null;
  /** Unknown (null, undefined or 0) hides the time part, never shows "0m". */
  totalTimeMin?: number | null;
  servings?: number | null;
  calories?: number | null;
  /** 0-4; null/undefined hides the dots. */
  spiceLevel?: number | null;
  /** Allergen display names, e.g. ["egg"]. */
  allergens?: string[];
  coverage?: RecipeCardCoverage;
  /** `source_name === 'Minced original'`: shows the AI disclosure badge. */
  aiDrafted?: boolean;
  /** Defaults to /recipes/{slug}. */
  href?: string;
  /** First cards in a list pass true so the browser doesn't lazy-load them. */
  priority?: boolean;
};

/**
 * The one recipe card, used by search, browse and the pantry matcher.
 * The whole card is a link (stretched from the title); the AI badge sits above
 * that overlay so it stays independently clickable. Server component.
 */
export function RecipeCard({
  slug,
  title,
  cuisine,
  imageUrl,
  photoCredit,
  totalTimeMin,
  servings,
  calories,
  spiceLevel,
  allergens,
  coverage,
  aiDrafted = false,
  href,
  priority = false,
}: RecipeCardProps) {
  const missing = coverage ? coverage.neededCount - coverage.haveCount : 0;

  return (
    <Card interactive className="flex h-full flex-col">
      <CardMedia className="flex items-end p-2.5">
        {imageUrl ? (
          // Remote host varies per source (federal / Wikimedia), so no next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="rounded-xs bg-canvas px-1.5 py-0.5 font-mono text-[0.5625rem] text-ink-subtle">
            photo · {title.toLowerCase()}
          </span>
        )}
        {imageUrl && photoCredit && (
          <span className="relative rounded-xs bg-canvas/90 px-1.5 py-0.5 font-mono text-[0.5625rem] text-ink-muted">
            {photoCredit}
          </span>
        )}
      </CardMedia>

      <CardBody className="flex flex-1 flex-col">
        {cuisine && <p className="label-mono mb-1.5 tracking-[0.08em]">{cuisine}</p>}
        <CardTitle className="mb-3">
          <Link
            href={href ?? `/recipes/${slug}`}
            className="rounded-xs after:absolute after:inset-0 focus-visible:outline-offset-4"
          >
            {title}
          </Link>
        </CardTitle>

        <MetaRow
          className="mt-auto border-t border-line pt-3"
          time={totalTimeMin ? totalTimeMin : undefined}
          servings={servings ?? undefined}
          calories={calories != null ? Math.round(calories) : undefined}
          spice={spiceLevel ?? undefined}
        />

        {coverage && (
          <p className="mt-2.5 text-[0.8125rem] leading-snug text-ink-muted">
            <span className="font-mono text-xs font-semibold text-herb">
              {coverage.haveCount}/{coverage.neededCount}
            </span>{" "}
            {missing === 0 ? (
              "You have everything"
            ) : (
              <>
                missing:{" "}
                <span className="text-ink">{coverage.missingNames.join(", ")}</span>
              </>
            )}
          </p>
        )}

        {allergens && allergens.length > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[0.6875rem] text-paprika-deep">
            <span aria-hidden className="size-1.5 rounded-full bg-paprika" />
            contains {allergens.join(", ")}
          </p>
        )}

        {aiDrafted && (
          <p className="relative z-10 mt-2.5">
            <Link
              href="/about"
              className="inline-block rounded-xs bg-sunken px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-muted underline-offset-2 hover:text-herb hover:underline"
            >
              Drafted with AI, reviewed by Minced
            </Link>
          </p>
        )}
      </CardBody>
    </Card>
  );
}

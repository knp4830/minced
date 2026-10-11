import { cn } from "@/lib/utils";
import { hashString, placeholderTone, type PlaceholderTone } from "@/lib/placeholderTone";

/*
 * Class strings are written out in full so Tailwind can see them; building
 * `bg-ph-${tone}` at runtime would be purged from the stylesheet.
 */
const TONE_CLASS: Record<PlaceholderTone, string> = {
  herb: "bg-ph-herb text-ph-herb-ink",
  paprika: "bg-ph-paprika text-ph-paprika-ink",
  saffron: "bg-ph-saffron text-ph-saffron-ink",
  clay: "bg-ph-clay text-ph-clay-ink",
  sage: "bg-ph-sage text-ph-sage-ink",
  slate: "bg-ph-slate text-ph-slate-ink",
};

/** Centre of the plate rings (left, top); picked by the slug so neighbours in a grid differ. */
const RING_CENTRE = [
  "left-[88%] top-[10%]",
  "left-[90%] top-[98%]",
  "left-[8%] top-[8%]",
  "left-[10%] top-[102%]",
];

export type RecipePlaceholderProps = {
  slug: string;
  title: string;
  /** Cuisine display name; picks the tone when present. */
  cuisine?: string | null;
  /** Aisle of the main ingredient (see primaryAisle); picks the tone otherwise. */
  aisle?: string | null;
  /** `hero` is the recipe page's big image area: larger type. */
  size?: "card" | "hero";
  className?: string;
};

/**
 * The tile shown when a recipe has no photo. It is a designed state, not a gap:
 * the dish name set in Fraunces on a tinted ground, with two faint concentric
 * rings that read as the rim of a plate and nothing more.
 *
 * Fills its positioned parent (`absolute inset-0`), so it drops into
 * CardMedia and the recipe-page frame unchanged. Decorative and `aria-hidden`:
 * the title is already the card's link and the page's heading.
 *
 * Type size follows the tile's own width (container query units) and steps
 * down with the length of the title, so "Pie" and "Pasta with Chickpeas,
 * Tomato, and Spinach" both fit without clipping at 165px or at 600px.
 */
export function RecipePlaceholder({
  slug,
  title,
  cuisine,
  aisle,
  size = "card",
  className,
}: RecipePlaceholderProps) {
  const tone = placeholderTone({ slug, cuisine, aisle });
  const ring = RING_CENTRE[hashString(slug) % RING_CENTRE.length];
  const label = cuisine ?? aisle ?? null;

  const len = title.length;
  const type =
    size === "hero"
      ? len <= 18
        ? "text-[clamp(1.75rem,11cqw,3.5rem)]"
        : len <= 34
          ? "text-[clamp(1.5rem,8.5cqw,2.75rem)]"
          : "text-[clamp(1.25rem,7cqw,2.25rem)]"
      : len <= 16
        ? "text-[clamp(1.0625rem,13cqw,2.25rem)]"
        : len <= 30
          ? "text-[clamp(0.9375rem,10.5cqw,1.75rem)]"
          : "text-[clamp(0.8125rem,8.5cqw,1.375rem)]";

  return (
    <div
      aria-hidden
      data-slot="recipe-placeholder"
      data-tone={tone}
      className={cn(
        "absolute inset-0 overflow-hidden [container-type:inline-size]",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute aspect-square w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-[0.16]",
          ring,
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-[0.12]",
          ring,
        )}
      />
      <div className="absolute inset-0 flex flex-col justify-between p-[7cqw]">
        <span className="font-mono text-[0.5625rem] tracking-[0.1em] uppercase opacity-75">
          {label}
        </span>
        <p
          className={cn(
            "line-clamp-5 font-display leading-[1.08] font-semibold tracking-[-0.015em] text-balance",
            type,
          )}
        >
          {title}
        </p>
      </div>
    </div>
  );
}

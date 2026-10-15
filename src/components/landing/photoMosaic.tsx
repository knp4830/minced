import Link from "next/link";
import type { LandingPhoto } from "@/lib/queries/landing";
import { cn } from "@/lib/utils";

/*
 * Hero imagery: one big tile and five small ones, so the eye has a place to land
 * instead of a flat 3x3 of equal squares. Real catalog photos, each a link to its
 * recipe; missing photos fall back to the hatched placeholder. The big tile carries
 * its recipe's name on a scrim so the picture reads as "a dish", not wallpaper.
 */
const SPANS = [
  "col-span-2 row-span-2",
  "",
  "",
  "",
  "",
  "",
] as const;

export function PhotoMosaic({ photos, className }: { photos: LandingPhoto[]; className?: string }) {
  const tiles = SPANS.map((span, i) => ({ span, photo: photos[i] ?? null, i }));
  return (
    <div className={className}>
      <ul
        aria-label="Some of the recipes"
        className="grid aspect-square grid-cols-3 grid-rows-3 gap-2 sm:gap-3"
      >
        {tiles.map(({ span, photo, i }) => (
          <li key={photo?.slug ?? `empty-${i}`} className={cn("min-h-0", span)} aria-hidden={photo ? undefined : true}>
            {photo ? (
              <Link
                href={`/recipes/${photo.slug}`}
                className="group relative block size-full overflow-hidden rounded-xl border border-line bg-hatch shadow-lift"
              >
                {/* Remote Storage host, already thumbnailed: no next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.alt}
                  width={400}
                  height={400}
                  loading="eager"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
                {i === 0 && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 to-transparent px-3.5 pt-10 pb-3 text-sm font-medium text-surface">
                    {photo.title}
                  </span>
                )}
              </Link>
            ) : (
              <div className="flex size-full items-end rounded-xl border border-line bg-hatch p-2">
                <span className="rounded-xs bg-canvas px-1.5 py-0.5 font-mono text-[0.5625rem] text-ink-subtle">
                  photo
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-right font-mono text-[0.6875rem] text-ink-subtle">
        <Link
          href="/about#photos"
          className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-herb"
        >
          Photo credits
        </Link>
      </p>
    </div>
  );
}

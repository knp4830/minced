import Link from "next/link";

import type { LandingPhoto } from "@/lib/queries/landing";
import { ME_ENABLED } from "@/lib/me/flag";
import { cn } from "@/lib/utils";

/*
 * Four equal tiles under the fridge band (wave 13, layout 3c): three photo tiles with white text along the
 * bottom, and "Your recipes" on a plain sunken tile marked LATER. A tile is a link only when there is a real
 * page behind it; Me is an honest "coming soon" while its flag is off. Phone: 2x2 at 150 px.
 */
type Tile = { id: string; title: string; body: string; href?: string; label?: string };

function tiles(): Tile[] {
  return [
    ME_ENABLED
      ? { id: "me", title: "Me", body: "Log what you cook and watch the day add up.", href: "/me" }
      : { id: "me", title: "Me", body: "A page that’s just yours, to log what you eat.", label: "Coming soon" },
    { id: "settings", title: "Saved filters", body: "Set your diet and allergens once.", href: "/settings" },
    { id: "shopping", title: "Shopping list", body: "One thing short? Put it on the list.", href: "/shopping" },
  ];
}

const tileBase = "relative flex h-[170px] flex-col justify-end overflow-hidden p-4 md:h-[380px] md:p-7";

export function FeatureTiles({ photos }: { photos: LandingPhoto[] }) {
  return (
    <section aria-labelledby="tiles-h" className="on-herb bg-night">
      <h2 id="tiles-h" className="sr-only">
        What else Minced does
      </h2>
      <ul className="grid grid-cols-2 gap-1 md:grid-cols-4">
        {tiles().map((t, i) => {
          const photo = photos[i];
          const inner = (
            <>
              {photo && (
                // Remote Storage host, already resized: no next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt=""
                  width={1200}
                  height={900}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              )}
              <span aria-hidden className="absolute inset-0 -z-10 bg-(image:--hero-overlay)" />
              {t.label && (
                <span className="mb-2 self-start rounded-full bg-saffron-tint px-2.5 py-0.5 font-mono text-[0.6875rem] tracking-[0.08em] text-saffron-ink uppercase">
                  {t.label}
                </span>
              )}
              <h3 className="text-[1.25rem] leading-tight text-on-night md:text-[1.875rem]">{t.title}</h3>
              <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-on-night md:text-[0.9375rem]">{t.body}</p>
            </>
          );
          return (
            <li key={t.id} className="isolate">
              {t.href ? (
                <Link href={t.href} className={cn(tileBase, "group isolate")}>
                  {inner}
                </Link>
              ) : (
                <div className={cn(tileBase, "isolate")}>{inner}</div>
              )}
            </li>
          );
        })}
        <li className={cn(tileBase, "bg-sunken")}>
          <span className="mb-2 self-start font-mono text-[0.6875rem] tracking-[0.12em] text-ink-subtle uppercase">
            Later
          </span>
          <h3 className="text-[1.25rem] leading-tight md:text-[1.875rem]">Your recipes</h3>
          <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-muted md:text-[0.9375rem]">
            Keep the dishes you actually cook, right next to ours.
          </p>
        </li>
      </ul>
    </section>
  );
}

import Link from "next/link";

import { FridgeCta } from "@/components/landing/fridgeCta";
import { FRIDGE_GROUP_COPY } from "@/components/pantry/fridgeGate";
import type { LandingPhoto } from "@/lib/queries/landing";

/**
 * "Cook from what you have", under the hero: what the fridge feature does and why it asks for an account.
 * The picture is a real catalogue photo with its recipe name (a link), not a mock-up: nothing on it claims
 * what is in anyone's fridge. Static, so the page stays cached; the call to action swaps in the signed-in
 * visitor's own fridge after load.
 */
export function CookFromWhatYouHave({ photo }: { photo: LandingPhoto | null }) {
  return (
    <section aria-labelledby="fridge-h" className="border-b border-line bg-surface">
      <div className="mx-auto grid max-w-[var(--page-max)] items-center gap-8 px-(--gutter) py-12 md:grid-cols-[1fr_0.8fr] md:gap-14 md:py-16">
        <div className="min-w-0">
          <p className="label-mono mb-3 text-herb">Cook from what you have</p>
          <h2 id="fridge-h" className="text-[1.75rem] leading-[1.08] tracking-[-0.02em] md:text-[2.25rem]">
            Open the fridge, find dinner.
          </h2>
          <p className="mt-4 max-w-[34em] text-base leading-relaxed text-ink-muted">
            Save what you have and Minced lists every recipe you can make, from nothing missing to a couple of
            things short. When something is short, one tap puts it on your shopping list. Food that’s about to
            expire gets cooked first.
          </p>
          <p className="mt-3 max-w-[34em] text-base leading-relaxed text-ink-muted">
            Your fridge is yours, so it lives in your account and follows you to your phone. Minced doesn’t keep it
            in your browser. Salt, pepper, oil, butter, sugar, flour and water are assumed.
          </p>

          <dl className="mt-6 grid max-w-[34rem] gap-x-5 gap-y-2.5 sm:grid-cols-[9.5rem_1fr]">
            {FRIDGE_GROUP_COPY.map(([name, text]) => (
              <div key={name} className="contents">
                <dt className="text-[0.9375rem] font-semibold text-ink">{name}</dt>
                <dd className="text-[0.875rem] leading-snug text-ink-muted">{text}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-7">
            <FridgeCta />
          </div>
        </div>

        {photo && (
          <figure className="min-w-0">
            <Link
              href={`/recipes/${photo.slug}`}
              className="block overflow-hidden rounded-2xl border border-line shadow-frame"
            >
              {/* Remote Storage host, already resized: no next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.alt}
                width={640}
                height={640}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] size-full object-cover md:aspect-square"
              />
            </Link>
            <figcaption className="mt-2 text-[0.8125rem] text-ink-muted">
              From the Minced catalogue:{" "}
              <Link href={`/recipes/${photo.slug}`} className="text-ink underline underline-offset-4 hover:text-herb">
                {photo.title}
              </Link>
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}

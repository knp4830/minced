import { FridgeCta } from "@/components/landing/fridgeCta";
import { FRIDGE_GROUP_COPY } from "@/components/pantry/fridgeGate";

/**
 * "What's in my fridge", right under the hero: what the fridge does and why it asks for an account.
 * The photo is a public-domain USDA Food Safety and Inspection Service picture of a stocked refrigerator
 * (Wikimedia Commons), shipped at 960 and 1600 px wide so it stays sharp on 2x screens. It claims nothing
 * about anyone's fridge. Static, so the page stays cached; the call to action swaps in the signed-in
 * visitor's own fridge after load.
 */
export function CookFromWhatYouHave() {
  return (
    <section aria-labelledby="fridge-h" className="border-b border-line bg-surface">
      <div className="mx-auto grid max-w-[var(--page-max)] items-center gap-8 px-(--gutter) py-12 md:grid-cols-[1fr_0.9fr] md:gap-14 md:py-16">
        <div className="min-w-0">
          <p className="label-mono mb-3 text-herb">Your fridge</p>
          <h2 id="fridge-h" className="text-[1.75rem] leading-[1.08] tracking-[-0.02em] md:text-[2.25rem]">
            What’s in my fridge?
          </h2>
          <p className="mt-4 max-w-[34em] text-base leading-relaxed text-ink-muted">
            Tell Minced what you have and it finds the recipes you can make from it, starting with the ones that
            need nothing more. It’s also a simple place to see what goes in and what comes out, so nothing gets
            lost at the back of the shelf.
          </p>
          <p className="mt-3 max-w-[34em] text-base leading-relaxed text-ink-muted">
            Your fridge belongs to you, so it’s saved to your account and waits for you on your phone and your
            laptop. If you’re one thing short, a tap puts it on your shopping list, and food that’s nearly out of
            time gets cooked first.
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

        <figure className="min-w-0">
          {/* A static file in /public, already sized: no next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/fridge-1600.jpg"
            srcSet="/landing/fridge-960.jpg 960w, /landing/fridge-1600.jpg 1600w"
            sizes="(min-width: 768px) 40vw, 100vw"
            alt="A bright open fridge shelf stocked with fresh vegetables, fruit, eggs and containers of leftovers."
            width={1600}
            height={1143}
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full rounded-2xl border border-line object-cover shadow-frame"
          />
          <figcaption className="mt-2 text-[0.8125rem] text-ink-muted">
            Photo: USDA Food Safety and Inspection Service, public domain, via{" "}
            <a
              href="https://commons.wikimedia.org/wiki/File:Food_Safety_-_Cut_Waste_in_Refrigerators_(20200605-FSIS-LSC-0059).jpg"
              className="text-ink underline underline-offset-4 hover:text-herb"
              rel="noopener"
            >
              Wikimedia Commons
            </a>
            .
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

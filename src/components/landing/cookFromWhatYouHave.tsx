import { FridgeCta } from "@/components/landing/fridgeCta";

/**
 * "What's in my fridge", right under the hero (wave 13, layout 3c): a photo band with a card on it. The
 * photo is a public-domain USDA Food Safety and Inspection Service picture of a stocked refrigerator
 * (Wikimedia Commons), shipped at 960 and 1600 px wide. It claims nothing about anyone's fridge. Static, so
 * the page stays cached; the call to action swaps in the signed-in visitor's own fridge after load.
 */
export function CookFromWhatYouHave() {
  return (
    <section aria-labelledby="fridge-h" className="relative isolate overflow-hidden bg-night">
      {/* A static file in /public, already sized: no next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing/fridge-1600.jpg"
        srcSet="/landing/fridge-960.jpg 960w, /landing/fridge-1600.jpg 1600w"
        sizes="100vw"
        alt=""
        width={1600}
        height={1143}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 -z-10 size-full object-cover"
      />
      <div className="page-w py-10 md:flex md:min-h-[560px] md:items-center md:py-16">
        <div className="max-w-[600px] rounded-[18px] bg-surface p-6 shadow-frame md:p-12">
          <p className="label-mono mb-3 text-herb">Your fridge</p>
          <h2 id="fridge-h" className="text-[1.625rem] leading-[1.08] md:text-[2.5rem]">
            What’s in my fridge?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Tell Minced what you have and it finds the recipes you can make from it, starting with the ones that
            need nothing more. It’s also a simple place to see what goes in and what comes out, so nothing gets
            lost at the back of the shelf.
          </p>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Your fridge belongs to you, so it’s saved to your account and waits for you on your phone and your
            laptop.
          </p>
          <div className="mt-6">
            <FridgeCta />
          </div>
        </div>
      </div>
      <p className="on-herb relative bg-night/85 px-(--gutter) py-1 text-right text-[0.75rem] text-on-night-muted">
        Photo: USDA Food Safety and Inspection Service, public domain, via{" "}
        <a
          href="https://commons.wikimedia.org/wiki/File:Food_Safety_-_Cut_Waste_in_Refrigerators_(20200605-FSIS-LSC-0059).jpg"
          className="-my-3 inline-block py-3 text-on-night underline underline-offset-4 hover:text-saffron"
          rel="noopener"
        >
          Wikimedia Commons
        </a>
        .
      </p>
    </section>
  );
}

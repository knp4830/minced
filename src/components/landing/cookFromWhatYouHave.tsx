import { FridgeCta } from "@/components/landing/fridgeCta";
import { FRIDGE_GROUP_COPY } from "@/components/pantry/fridgeGate";

/**
 * "What's in my fridge", right under the hero. Wave 13: the owner found the photo band too long and too
 * busy, so it is now two columns: the explanation and the call to action on the left, an example fridge on
 * the right drawn in the fridge page's own vocabulary (expiry lines, the four result groups). The example is
 * labelled as one and names no recipes, so it promises nothing the matcher would not do. Static, so the page
 * stays cached; the call to action swaps in the signed-in visitor's own fridge after load.
 */
const STEPS = [
  "Back from the shops? Add what you bought, with the dates on the packs.",
  "Open Minced and see what you can make from it.",
  "Pull it out and cook, starting with what runs out first.",
] as const;

const EXAMPLE = [
  { name: "spinach", note: "expires tomorrow", soon: true },
  { name: "feta", note: "expires in 4 days", soon: false },
  { name: "tomatoes", note: "expires in 5 days", soon: false },
  { name: "eggs", note: "expires in 12 days", soon: false },
  { name: "onion", note: "no date", soon: false },
] as const;

export function CookFromWhatYouHave() {
  return (
    <section aria-labelledby="fridge-h" className="border-b border-line bg-surface">
      <div className="page-w grid items-center gap-10 py-12 md:grid-cols-[1.05fr_0.95fr] md:gap-16 md:py-20">
        <div className="min-w-0">
          <p className="label-mono mb-3 text-herb">Your fridge</p>
          <h2 id="fridge-h" className="text-[1.75rem] leading-[1.08] md:text-[2.5rem]">
            What’s in my fridge?
          </h2>
          <p className="mt-4 max-w-[34em] text-base leading-relaxed text-ink-muted">
            Tell Minced what you have and it finds the recipes you can make, starting with the ones that need
            nothing more, so nothing gets lost at the back of the shelf. It’s saved to your account and waits for
            you on your phone and your laptop.
          </p>
          <ol className="mt-6 flex max-w-[34em] flex-col gap-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-[0.9375rem] leading-snug text-ink">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-herb font-mono text-[0.75rem] text-on-herb"
                >
                  {i + 1}
                </span>
                <span className="pt-1">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-7">
            <FridgeCta />
          </div>
        </div>

        <figure className="min-w-0 rounded-[18px] border border-line-strong bg-canvas p-5 shadow-frame md:p-7">
          <figcaption className="mb-4 flex items-baseline justify-between gap-3">
            <span className="font-display text-[1.25rem]">My fridge</span>
            <span className="rounded-full bg-sunken px-2.5 py-0.5 font-mono text-[0.6875rem] tracking-[0.08em] text-ink-subtle uppercase">
              Example
            </span>
          </figcaption>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {EXAMPLE.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[0.9375rem] text-ink">{item.name}</span>
                <span
                  className={
                    item.soon
                      ? "rounded-md bg-paprika/10 px-2 py-0.5 font-mono text-[0.75rem] text-paprika-deep"
                      : "font-mono text-[0.75rem] text-ink-subtle"
                  }
                >
                  {item.note}
                </span>
              </li>
            ))}
          </ul>
          <p className="label-mono mt-5 mb-2">Then your recipes, in four groups</p>
          <dl className="grid grid-cols-[6.75rem_1fr] gap-x-3 gap-y-2 sm:grid-cols-[7.5rem_1fr] sm:gap-x-4">
            {FRIDGE_GROUP_COPY.map(([name, text], i) => (
              <div key={name} className="contents">
                <dt>
                  <span
                    className={
                      i === 0
                        ? "rounded-md bg-saffron-tint px-2 py-0.5 font-mono text-[0.75rem] text-saffron-ink"
                        : "font-mono text-[0.75rem] text-ink"
                    }
                  >
                    {name}
                  </span>
                </dt>
                <dd className="text-[0.875rem] leading-snug text-ink-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </figure>
      </div>
    </section>
  );
}

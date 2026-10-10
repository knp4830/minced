import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "How recipes are made",
  description:
    "Where Minced's recipes, photos and nutrition numbers come from, and where they can be wrong.",
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 md:mt-12">
      <h2 id={id} className="text-xl md:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-ink-soft md:text-base">
        {children}
      </div>
    </section>
  );
}

const link =
  "font-medium text-ink underline underline-offset-4 hover:text-herb";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[44rem] px-(--gutter) py-8 md:py-14">
      <h1 className="text-[2rem] leading-[1.05] md:text-[2.75rem]">How recipes are made</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft md:text-[1.0625rem]">
        Every recipe on Minced is ingredients, amounts and numbered steps. Here is
        where they come from, and what to double-check.
      </p>

      <Section id="usda" title="Most recipes: USDA MyPlate Kitchen">
        <p>
          The bulk of the catalog is adapted from MyPlate Kitchen, the
          U.S. Department of Agriculture&apos;s recipe collection. Those recipes are
          works of the U.S. federal government and are in the public domain. USDA
          has since retired the MyPlate site, so Minced read the pages from the
          Internet Archive&apos;s saved copies.
        </p>
        <p>
          We normalise units, match each ingredient to a standard ingredient list
          and reflow the steps. Because that changes the text, each page says
          &ldquo;adapted from&rdquo;, not &ldquo;by USDA&rdquo;.
        </p>
      </Section>

      <Section id="ai" title="Minced originals: drafted with AI, reviewed by Minced">
        <p>
          Some recipes are marked <span className="whitespace-nowrap font-mono text-[0.8125rem]">Drafted with AI, reviewed by Minced</span>.
          An AI model wrote the first draft; a person then checked the
          ingredients, amounts, steps and cook times and fixed what was wrong.
        </p>
        <p>
          That is not the same as cooked and tested in a kitchen. If a time or
          temperature looks off to you, trust your thermometer and your senses,
          and cook meat, poultry and eggs to the safe internal temperatures
          published by the USDA.
        </p>
      </Section>

      <Section id="photos" title="Photos">
        <p>
          A photo appears only when we can use it honestly: public-domain photos
          from U.S. federal sources, or Wikimedia Commons files licensed CC0,
          CC BY or CC BY-SA, with the author credited on the image. Where a
          photo is not free to use, or isn&apos;t a real picture of that dish, the
          card shows a plain striped block instead. We never show an AI-generated
          image as the finished dish.
        </p>
      </Section>

      <Section id="nutrition" title="Nutrition is an estimate">
        <p>
          Calories and nutrients are estimated from USDA FoodData Central, which
          is public domain. Brands, trimming, cooking method and how you measure
          all move the real numbers. Treat them as a guide, not a label.
        </p>
        <p>
          Minced is not medical or dietary advice. If you are pregnant, managing a
          medical condition or on a prescribed diet, check with a qualified
          professional.
        </p>
      </Section>

      <Section id="allergens" title="Allergen information can be wrong">
        <p>
          Allergens are worked out from the ingredients a recipe lists. That
          means they can be incomplete or wrong. They cannot see the brand of soy
          sauce you buy, a &ldquo;may contain&rdquo; label or cross-contact in a
          factory or kitchen. Read the labels of what you buy, and do not rely on
          Minced if you have a serious allergy.
        </p>
      </Section>

      <Section id="matching" title="How the pantry search works">
        <p>
          Each recipe ingredient is matched to one standard ingredient, so
          &ldquo;scallion&rdquo; and &ldquo;green onion&rdquo; are the same
          thing. Salt, pepper, oil, butter, sugar, flour and water are assumed to
          be in your kitchen and never count as missing, and optional ingredients
          are not counted either. Your pantry stays in your browser and in the
          link you share. There are no accounts yet.
        </p>
      </Section>

      <Section id="independent" title="Not affiliated with USDA">
        <p>
          Minced is an independent project. It is not affiliated with, endorsed by
          or reviewed by the USDA.
        </p>
        <p>
          Ready to cook?{" "}
          <Link href="/" className={link}>
            Start from what&apos;s in your kitchen
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}

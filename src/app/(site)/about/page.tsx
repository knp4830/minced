import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getPhotoCredits } from "@/lib/queries/landing";

export const metadata: Metadata = {
  title: "How recipes are made",
  alternates: { canonical: "/about" },
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

export const revalidate = 3600;

export default async function AboutPage() {
  const credits = await getPhotoCredits();
  return (
    <div className="page-w py-8 md:py-14 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,46rem)] lg:gap-x-20">
      <header className="lg:sticky lg:top-24 lg:self-start">
        <h1 className="text-[2rem] leading-[1.05] md:text-[2.75rem]">How recipes are made</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft md:text-[1.0625rem]">
          Every recipe on Minced is ingredients, amounts and numbered steps. Here is
          where they come from, and what to double-check.
        </p>
      </header>

      <div className="lg:[&>section:first-child]:mt-0">
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
          An AI model wrote the draft. Each dish was checked against several
          independent recipes to confirm it is a real, traditional dish with a
          standard ingredient list, and Minced reviewed the result for ingredient
          matching. Amounts, cook times and steps are our own and have not all
          been checked by a cook.
        </p>
        <p>
          That is not the same as cooked and tested in a kitchen. If a time or
          temperature looks off to you, trust your thermometer and your senses,
          and cook meat, poultry and eggs to the safe internal temperatures
          published by the USDA.
        </p>
      </Section>

      <Section id="credits" title="Body-map artwork">
        <p>
          The muscle diagrams on the Me page use body artwork from{" "}
          <a className="relative underline underline-offset-2 after:absolute after:-inset-y-4 after:inset-x-0 after:content-['']" href="https://github.com/HichamELBSI/react-native-body-highlighter">
            react-native-body-highlighter
          </a>{" "}
          by Hicham El Bsi, released under the MIT licence. The full licence text is in THIRD_PARTY_NOTICES.md in the
          project repository.
        </p>
      </Section>

      <Section id="photos" title="Photos">
        <p>
          A photo appears only when we can use it honestly: public-domain photos
          (USDA photographs and other files marked public domain), or files
          from Wikimedia Commons and Openverse (mostly Flickr) licensed CC0,
          CC BY or CC BY-SA, with the author credited on the image where the licence asks for it. Where a
          photo is not free to use, or isn&apos;t a real picture of that dish, the
          card shows a plain striped block instead. We never show an AI-generated
          image as the finished dish.
        </p>
        {credits.length > 0 && (
          <details open className="rounded-xl border border-line bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[0.9375rem] font-semibold">
              Photo credits ({credits.length})
            </summary>
            <ul className="divide-y divide-line border-t border-line text-sm">
              {credits.map((c) => (
                <li key={c.slug} className="px-4">
                  <Link href={`/recipes/${c.slug}`} className={`${link} inline-block min-w-11 py-3.5`}>
                    {c.title}
                  </Link>
                  <span className="text-ink-muted">
                    {" "}
                    &mdash;{" "}
                    <a href={c.attributionUrl} className={`${link} inline-block min-w-11 py-3.5`} rel="noopener">
                      {c.credit ?? "Source"}
                    </a>
                    ,{" "}
                    {c.licenseUrl ? (
                      <a href={c.licenseUrl} className={`${link} inline-block min-w-11 py-3.5`} rel="noopener">
                        {c.license}
                      </a>
                    ) : (
                      c.license
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section id="nutrition" title="Nutrition is an estimate">
        <p>
          Calories and nutrients are estimated from USDA FoodData Central, which
          is public domain. Recipes adapted from MyPlate Kitchen carry USDA&apos;s
          own published values; for the rest, Minced adds up the USDA values of
          each ingredient. Brands, trimming, cooking method and how you measure
          all move the real numbers. Treat them as a guide, not a label.
        </p>
        <p>
          Nutrient data: U.S. Department of Agriculture, Agricultural Research
          Service, FoodData Central (fdc.nal.usda.gov). That includes its
          Foundation, SR Legacy and Survey (FNDDS) foods, and the manufacturer
          label data in its Branded Foods set, which is where brand names such as
          a particular soy sauce come from. FoodData Central is public domain
          (CC0 1.0). Vitamin and mineral figures are worked out from the
          ingredients before cooking, so they can be higher than what is left
          after boiling or baking. A nutrient is shown only when enough of a
          recipe&apos;s ingredients report it, and an ingredient with no nutrition
          data is listed as not counted rather than guessed.
        </p>
        <p>
          For some world ingredients that FoodData Central does not cover, nutrient values come from two national
          composition tables, copied once into our own database (no live calls). UK foods: McCance and
          Widdowson&apos;s Composition of Foods Integrated Dataset 2021, Public Health England. Contains public sector
          information licensed under the{" "}
          <a className="underline" href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
            Open Government Licence v3.0
          </a>
          . Canadian foods: Canadian Nutrient File 2026, Health Canada. Contains information licensed under the{" "}
          <a className="underline" href="https://open.canada.ca/en/open-government-licence-canada">
            Open Government Licence - Canada
          </a>
          .
        </p>
        <p>
          Daily values on recipe pages are the U.S. FDA label values for a 2,000-calorie diet. On your Me page they are
          personal: your own calorie and macro targets, 10% of your calories for saturated fat and added sugars (Dietary
          Guidelines for Americans), and, for fiber, vitamins and minerals, the Recommended Dietary Allowance or
          Adequate Intake for your sex and age from the Dietary Reference Intakes (National Academies of Sciences,
          Engineering, and Medicine; potassium and sodium from the 2019 update). They are not adjusted for pregnancy,
          breastfeeding or smoking.
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

      <Section id="matching" title="How the fridge search works">
        <p>
          Save what you have to your account and Minced groups every recipe by how little you are missing: what you can make now,
          then one thing short, then two, closest match first. Each recipe ingredient is matched to one
          standard ingredient, so
          &ldquo;scallion&rdquo; and &ldquo;green onion&rdquo; are the same
          thing. Salt, pepper, oil, butter, sugar, flour and water are assumed to
          be in your kitchen and never count as missing, and optional ingredients
          are not counted either. Saving a fridge needs an account, because it is kept in your account
          and nowhere in your browser. Without one, you can still use &ldquo;Choose ingredients&rdquo; on the recipes page to find
          recipes that use them. An account also keeps your favourite recipes and a shopping list.
        </p>
      </Section>

      <Section id="independent" title="Not affiliated with USDA">
        <p>
          Minced is an independent project. It is not affiliated with, endorsed by
          or reviewed by the USDA.
        </p>
        <p>
          Ready to cook?{" "}
          <Link href="/" className={`${link} inline-block py-3`}>
            Start from what&apos;s in your kitchen
          </Link>
          .
        </p>
      </Section>
      </div>
    </div>
  );
}

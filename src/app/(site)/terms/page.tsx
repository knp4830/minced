import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_URL, LegalPage, LegalSection, legalLink } from "@/components/shell/legalPage";

export const metadata: Metadata = {
  title: "Terms of use",
  alternates: { canonical: "/terms" },
  description: "The rules for using Minced, in plain language.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="October 10, 2026"
      intro="Minced is a free recipe site run as a personal portfolio project. By using it, or by creating an account, you agree to these terms. They are short on purpose."
    >
      <LegalSection id="use" title="Using Minced">
        <ul>
          <li>You must be 13 or older to make an account.</li>
          <li>Keep your password to yourself. You are responsible for what happens under your account.</li>
          <li>Do not scrape the site at a rate that slows it for others, attack it, or try to reach other people&apos;s data.</li>
          <li>
            We may change, pause or end the service, or close an account that
            abuses it, at any time. It is a hobby project, with no uptime promise.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="recipes" title="Recipes, nutrition and allergens">
        <p>
          Recipes are cooking suggestions, not professional advice. Nutrition
          numbers are estimates from USDA data and vary with brands and how you
          cook.
        </p>
        <p>
          Allergen information is derived from the listed ingredients and may be
          incomplete or wrong. It does not account for brands, processing or
          cross-contact. Always read the labels of what you buy, and do not rely on
          Minced if you have a serious allergy. Follow safe food-handling
          temperatures for meat, poultry and eggs.
        </p>
      </LegalSection>

      <LegalSection id="content" title="Content on Minced">
        <p>
          Recipes come from USDA MyPlate Kitchen (public domain) and from Minced
          itself, some drafted with AI and reviewed by us; see{" "}
          <Link href="/about" className={legalLink}>
            how recipes are made
          </Link>
          . Photos carry the credit and licence shown with them. The Minced name,
          design and code are ours. If something on the site infringes your
          rights, open an issue at{" "}
          <a href={CONTACT_URL} rel="noopener noreferrer" className={legalLink}>
            github.com/knp4830/minced/issues
          </a>{" "}
          naming the page and we will look at it promptly.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="No warranty, limited liability">
        <p>
          Minced is provided &ldquo;as is&rdquo;, without warranties of any kind.
          To the extent the law allows, we are not liable for any loss or harm that
          comes from using the site or relying on a recipe, a nutrition number or an
          allergen note. Nothing here limits rights you have by law that cannot be
          limited.
        </p>
      </LegalSection>

      <LegalSection id="privacy" title="Your data">
        <p>
          How we handle your email and saved recipes is in the{" "}
          <Link href="/privacy" className={legalLink}>
            privacy policy
          </Link>
          . You can delete your account at any time from the account page.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>
          We may update these terms. The date above changes when we do, and
          continuing to use Minced after that means you accept the new version.
          Questions go in an issue on{" "}
          <a href={CONTACT_URL} rel="noopener noreferrer" className={legalLink}>
            GitHub
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

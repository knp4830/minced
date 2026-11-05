import type { Metadata } from "next";

import { pageMeta } from "@/lib/seo/meta";
import { CONTACT_URL, LegalPage, LegalSection, legalLink } from "@/components/shell/legalPage";

export const metadata: Metadata = pageMeta({
  title: "Accessibility",
  path: "/accessibility",
  description: "How Minced aims to work for everyone, what we know is still rough, and how to tell us.",
});

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility"
      updated="October 23, 2026"
      intro="Everyone should be able to find something to cook here. If something on Minced gets in your way, we would like to know, and we will do our best to fix it."
    >
      <LegalSection id="aim" title="What we aim for">
        <p>
          We build to the Web Content Accessibility Guidelines (WCAG) 2.1, level AA. In practice that means you can use
          every page with a keyboard alone, with a screen reader, and with your browser zoomed in to 200 percent.
        </p>
        <ul>
          <li>Colours are chosen for readable contrast in both light and dark themes, and nothing relies on colour alone.</li>
          <li>Every form field has a label, every image has a description or is marked as decoration, and links and buttons have names.</li>
          <li>There is a &ldquo;skip to content&rdquo; link, a visible focus ring, and motion respects your reduced-motion setting.</li>
          <li>Buttons and controls are sized for a thumb on a phone.</li>
        </ul>
      </LegalSection>

      <LegalSection id="known" title="What we know is still rough">
        <ul>
          <li>
            Minced is a one-person project and has not had an outside accessibility audit. We have run automated checks and
            tried it by keyboard, but we have not yet had it tested with a range of screen readers or by disabled users.
          </li>
          <li>
            A few links that sit inside a sentence, such as source and licence credits, are smaller than the ideal tap size.
          </li>
          <li>
            Recipe photos come from several sources, and some descriptions are short. Where a photo is only decoration, it is
            hidden from screen readers.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="tell" title="Tell us about a barrier">
        <p>
          If you cannot use something, please open an issue at{" "}
          <a href={CONTACT_URL} rel="noopener noreferrer" className={legalLink}>
            github.com/knp4830/minced/issues
          </a>{" "}
          and say which page and what you were trying to do. You do not need to know the technical reason. We will reply there
          and let you know what we can change.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

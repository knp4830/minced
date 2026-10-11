import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_URL, LegalPage, LegalSection, legalLink } from "@/components/shell/legalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Minced stores about you, who processes it, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 10, 2026"
      intro="Minced is a small personal project. You can browse every recipe without an account and without giving us anything. If you make an account, this page says exactly what we keep and how to remove it."
    >
      <LegalSection id="who" title="Who runs this">
        <p>
          Minced is run by an individual as a portfolio project, not a company. To
          ask a question or make a request, open an issue at{" "}
          <a href={CONTACT_URL} rel="noopener noreferrer" className={legalLink}>
            github.com/knp4830/minced/issues
          </a>
          . Issues are public, so do not put private details in one. For an
          account request, say only that you want it handled, and we will tell you
          how to confirm it is you.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="What we store">
        <p>Without an account: nothing about you. Searching and browsing are not recorded against a person.</p>
        <p>With an account:</p>
        <ul>
          <li>Your email address, so you can log in and recover your password.</li>
          <li>A hashed password. We never see or store the password itself.</li>
          <li>The recipes you save (your favourites).</li>
          <li>When the account was created.</li>
        </ul>
        <p>
          We do not run analytics, advertising, or tracking scripts, and we do not
          collect your date of birth, location, or payment details. We do not sell
          or share personal information.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies">
        <p>
          Logging in sets cookies that keep you signed in (their names start with{" "}
          <code className="font-mono text-[0.875em]">sb-</code>). They exist only to
          remember that you are logged in, and are removed when you log out (at the
          latest they expire after about 13 months). Because they are strictly necessary for the login you asked
          for, there is no cookie banner. Nothing else on Minced sets cookies.
        </p>
      </LegalSection>

      <LegalSection id="processors" title="Who handles the data">
        <p>These services process data on our behalf. We have no other recipients.</p>
        <ul>
          <li>
            <strong className="font-semibold text-ink">Supabase</strong> stores
            accounts and saved recipes in a database hosted in the United States and
            sends the sign-up and password-reset emails.
          </li>
          <li>
            <strong className="font-semibold text-ink">Vercel</strong> hosts the site.
            Like any web host, it sees your IP address and the pages you request in
            its server logs.
          </li>
        </ul>
        <p>
          Some recipe photos load from Wikimedia Commons or Supabase Storage. Your
          browser contacts those servers directly to fetch them, so they can see
          your IP address, as with any image on any website. Fonts are served from
          Minced itself.
        </p>
      </LegalSection>

      <LegalSection id="keep" title="How long we keep it">
        <p>
          For as long as the account exists. When you delete the account, your
          email, password hash and saved recipes are removed immediately. Any copy in
          the host&apos;s routine backups ages out on the host&apos;s own schedule and
          is never restored for any purpose except recovering the whole site.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="Your choices">
        <ul>
          <li>
            <strong className="font-semibold text-ink">Delete everything:</strong>{" "}
            Account, then Settings, then Delete your account. It works instantly,
            with no email to us required.
          </li>
          <li>
            <strong className="font-semibold text-ink">See or correct your data:</strong>{" "}
            your email and saved recipes are all there is, and both are visible on
            your <Link href="/account" className={legalLink}>account page</Link>. To
            change your email or get a copy, open an issue.
          </li>
          <li>
            Whatever your local law gives you (access, deletion, correction,
            portability, objection), you can ask, and we will honour it. California
            residents: we do not sell or share personal information.
          </li>
        </ul>
        <p>
          We do not respond differently to browser &ldquo;Do Not Track&rdquo; or
          Global Privacy Control signals, because there is no tracking for them to
          switch off.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          Minced is for people 13 and older. We do not ask for a date of birth. If
          we learn that an account belongs to a child under 13, we delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>
          If this policy changes, the date above changes. Earlier versions stay in
          the project&apos;s public history on GitHub.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

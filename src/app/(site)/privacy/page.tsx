import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_URL, LegalPage, LegalSection, legalLink } from "@/components/shell/legalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  alternates: { canonical: "/privacy" },
  description: "What Minced stores about you, who processes it, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 16, 2026"
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
        <p>Without an account, we do not keep a profile of you, and searching and browsing are not recorded against a person. If you use the
          &ldquo;What&apos;s in my fridge&rdquo; picker, your picks are saved in your
          own browser storage on your device. They are also sent in the page address
          (<code className="font-mono text-[0.875em]">/pantry?pantry=&hellip;</code>) each time you tap
          &ldquo;show recipes&rdquo;, so our server can find matching recipes. They are not tied to an account, but
          they may appear in our hosting provider&apos;s request logs alongside your IP address. The same goes for the
          cookware you say you own (&ldquo;My cookware&rdquo;): it is kept in your browser storage and sent in the page
          address (<code className="font-mono text-[0.875em]">ownedCookware=&hellip;</code>). Your shopping list, when you are not signed in, is kept only in your browser storage and is never sent to us.</p>
        <p>With an account:</p>
        <ul>
          <li>Your email address, so you can log in and recover your password.</li>
          <li>A hashed password. We never see or store the password itself.</li>
          <li>
            If you choose &ldquo;Continue with Google&rdquo; instead of a password: the email address and Google account
            id Google shares with us. We ask only for who you are (openid, email, profile), never for your mail, files
            or contacts, and we do not store a password for that login.
          </li>
          <li>The recipes you save (your favourites).</li>
          <li>The cookware you say you own, if you set &ldquo;My cookware&rdquo; while signed in.</li>
          <li>
            Your saved fridge, if you keep one while signed in: the ingredients,
            and the purchase dates, expiry dates and amounts you add to them.
          </li>
          <li>
            Your shopping list, if you use it while signed in: the ingredients
            and amounts, which recipe they came from, and what you have ticked off.
          </li>
          <li>
            Your <strong className="font-semibold text-ink">Me page</strong> data, if you use it while signed in. This is
            health-related, so it is listed in full under &ldquo;Health and fitness data&rdquo; below.
          </li>
          <li>When the account was created.</li>
          <li>
            Sign-in logs (IP address and browser) that Supabase keeps for
            security, such as when you log in or reset a password.
          </li>
        </ul>
        <p>
          Accounts have a public profile record (an id and an optional display
          name). It holds no email and no other personal details today.
        </p>
        <p>
          We do not run analytics, advertising, or tracking scripts, and we do not
          collect your date of birth, precise location, or payment details. We do not sell
          or share personal information.
        </p>
      </LegalSection>

      <LegalSection id="health" title="Health and fitness data">
        <p>
          The Me page is optional. Only if you use it, and only while signed in, we store the following, tied to your
          account:
        </p>
        <ul>
          <li>
            Your targets: sex (female or male), age, height, weight, activity level, goal, goal weight, and the calorie and
            macronutrient targets worked out from them.
          </li>
          <li>
            Your food log: what you ate, the meal and date, and the calories, protein, carbohydrate, fat, and where
            given, fiber and sodium.
          </li>
          <li>Your workouts: the date, the session type, minutes, sets, and which muscle groups you trained.</li>
          <li>Your sleep: hours slept on each date you enter.</li>
          <li>Your weigh-ins: the weight you log on each date, and which targets reminders you have dismissed.</li>
        </ul>
        <p>
          This is sensitive, so: it is used only to show you your own page. It is not used for advertising or analytics,
          not combined with anything else, and not shared or sold. Only you can read it (the database enforces that for
          each row), and it is never public. You can delete any single entry on the page, download all of it with
          &ldquo;Download my data&rdquo;, or delete the account to remove all of it at once. Minced is not a medical
          service, and the targets are general estimates, not medical advice.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies">
        <p>
          Logging in sets cookies that keep you signed in (their names start with{" "}
          <code className="font-mono text-[0.875em]">sb-</code>). They exist only to
          remember that you are logged in, and are removed when you log out (at the
          latest they expire after about 13 months). Because they are strictly necessary for the login you asked
          for, there is no cookie banner. If you use the Me page, one more small cookie,{" "}
          <code className="font-mono text-[0.875em]">me_tz</code>, remembers your time zone (for example America/New_York) for one year so
          the page can tell which day it is for you. It holds no other information, and it is removed when you log out or delete your account.
          Nothing else on Minced sets cookies. (Your fridge picks are saved in browser storage on your device, not in cookies.)
        </p>
      </LegalSection>

      <LegalSection id="processors" title="Who handles the data">
        <p>These services process data on our behalf. We have no other recipients.</p>
        <ul>
          <li>
            <strong className="font-semibold text-ink">Google</strong>, only if you use &ldquo;Continue with
            Google&rdquo;. Google handles that sign-in under its own privacy policy and tells us your email address
            and name; we do not send it anything about what you do on Minced.
          </li>
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

      <LegalSection id="basis" title="Why we use it, and transfers">
        <ul>
          <li>
            <strong className="font-semibold text-ink">Running your account</strong>{" "}
            (email, password hash, saved recipes, cookware, fridge, shopping list, and Me page data): needed to provide the account
            you asked for (contract).
          </li>
          <li>
            <strong className="font-semibold text-ink">Sign-in logs:</strong> our
            legitimate interest in keeping accounts and the site secure.
          </li>
        </ul>
        <p>
          Our processors are based in, or may process data in, the United States.
          Where data moves from the EU, UK or Switzerland, it relies on the
          processor&apos;s Standard Contractual Clauses and, where they are
          certified, the EU-US Data Privacy Framework.
        </p>
      </LegalSection>

      <LegalSection id="keep" title="How long we keep it">
        <p>
          For as long as the account exists. When you delete the account, your
          email, password hash, saved recipes, cookware, fridge, shopping list and Me page data (targets, food log, workouts, sleep, weigh-ins) are removed immediately. Security
          logs (which can include your email and IP address) and routine backups
          age out on the host&apos;s own schedule, and are never restored for any purpose except recovering the whole site.
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
            your email, saved recipes, cookware, fridge, shopping list and Me page data are all there is. Your email and saved recipes are visible on
            your <Link href="/account" className={legalLink}>account page</Link>, your cookware in the
            &ldquo;My cookware&rdquo; filter, your fridge on <Link href="/fridge" className={legalLink}>My fridge</Link> and your list on the <Link href="/shopping" className={legalLink}>shopping list</Link>. You
            can download a copy from Settings (&ldquo;Download my data&rdquo;). To
            change your email, open an issue.
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

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteAccountForm } from "@/components/account/authForms";
import { BodyForm } from "@/components/settings/bodyForm";
import { CookwareEditor } from "@/components/settings/cookwareEditor";
import { FoodDefaultsForm } from "@/components/settings/foodDefaultsForm";
import { NameForm } from "@/components/settings/nameForm";
import { SettingsSection } from "@/components/settings/settingsSection";
import { UnitsWeekForm } from "@/components/settings/unitsWeekForm";
import { getCurrentUser } from "@/lib/queries/account";
import { getFilterOptions } from "@/lib/queries/browse";
import { getMySettings, getProfileName } from "@/lib/queries/settings";
import { getMyCookwareSlugs } from "@/lib/queries/userCookware";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false },
};

/*
 * Everything a person sets once and Minced uses everywhere: name, units, week start, sex, default diet and
 * allergen filters, owned cookware, their data and deleting the account. Private, per request, never indexed.
 * Each section saves by itself (see components/settings).
 */
export default async function SettingsPage() {
  // Middleware already redirects signed-out visitors; this is the real check.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fsettings");

  const [settings, profileName, options, myCookware] = await Promise.all([
    getMySettings(),
    getProfileName(),
    getFilterOptions(),
    getMyCookwareSlugs().catch(() => [] as string[]),
  ]);

  return (
    <div className="page-w py-6 md:py-10">
      <div className="max-w-xl">
        <h1 className="text-[1.75rem] leading-tight md:text-[2rem]">Settings</h1>
        <p className="mt-1.5 mb-8 text-[0.9375rem] leading-relaxed text-ink-muted">
          Set these once and Minced uses them everywhere.{" "}
          <Link href="/account" className="underline underline-offset-4 hover:text-herb">
            Back to your account
          </Link>
        </p>

        <SettingsSection id="profile" eyebrow="Profile" title="You">
          <NameForm initial={profileName ?? ""} fallback={user.email.split("@")[0] || "Your email name"} />
          <p className="mt-4 text-[0.875rem] text-ink-muted">
            Signed in as <span title={user.email} className="font-mono text-[0.8125rem] text-ink">{user.email}</span>.
            To change your password, use{" "}
            <Link href="/forgot-password" className="underline underline-offset-4 hover:text-herb">
              Forgot password
            </Link>
            .
          </p>
        </SettingsSection>

        <SettingsSection id="units" eyebrow="Units and week" title="How you count">
          <UnitsWeekForm units={settings.units} weekStart={settings.weekStart} />
        </SettingsSection>

        <SettingsSection id="body" eyebrow="Body" title="Your calorie estimate">
          <BodyForm sex={settings.sex} birthYear={settings.birthYear} />
        </SettingsSection>

        <SettingsSection
          id="food"
          eyebrow="Food defaults"
          title="What you eat"
          lead="Recipes and the fridge matcher leave out anything that doesn’t fit. You can set your diet aside for a single search; your allergens stay hidden unless you choose to look past them, and we will ask first."
        >
          <FoodDefaultsForm
            diets={options.diets}
            allergens={options.allergens}
            initial={{ diet: settings.diet, allergens: settings.allergens }}
          />
        </SettingsSection>

        <SettingsSection
          id="cookware"
          eyebrow="Cookware"
          title="My cookware"
          lead={
            <>
              Tap what you own. Switch on &ldquo;Only what I can make with my cookware&rdquo; in the recipe filters and
              Minced hides anything that needs a pan or pot you don&apos;t have.
            </>
          }
        >
          <CookwareEditor all={options.allCookware} initial={myCookware} />
        </SettingsSection>

        <SettingsSection id="data" eyebrow="Your data" title="What Minced stores">
          <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
            Minced stores your email, your settings, the recipes you save, your cookware, your fridge (with dates and
            amounts), your shopping list, and security sign-in logs. If you use Me, it also stores your targets (sex,
            age, height, weight, goal), food log, workouts and sleep; they are included in the download below. The
            only cookie these settings add is a small one that remembers your default filters for a week. Without an
            account, your shopping list stays in this browser only.{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-herb">
              Read the privacy policy
            </Link>
            .
          </p>
          <a
            href="/api/me/export"
            download
            className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium underline underline-offset-4 hover:text-herb"
          >
            Download my data
          </a>
        </SettingsSection>

        <SettingsSection id="delete" eyebrow="Careful" title="Delete your account">
          <p className="mb-4 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
            Removes your login, settings, saved recipes, fridge, shopping list and everything you logged on Me
            (targets, meals, workouts, sleep) right away. This can&apos;t be undone.
          </p>
          <DeleteAccountForm />
        </SettingsSection>
      </div>
    </div>
  );
}

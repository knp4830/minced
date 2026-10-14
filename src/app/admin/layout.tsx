import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/queries/adminReview";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Minced admin" },
  robots: { index: false, follow: false },
};

/*
 * Everything under /admin is behind requireAdmin(): signed-out visitors and
 * ordinary accounts both get the site's 404, so the route does not advertise
 * itself. The layout re-runs on every request (it reads cookies), so this is
 * checked on each navigation, not once per session.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <header className="border-b border-line-strong bg-surface">
        <nav
          aria-label="Admin"
          className="flex page-w flex-wrap items-center gap-x-5 gap-y-1 py-2.5 text-[0.875rem]"
        >
          <span className="font-display text-[1.0625rem] font-semibold">Minced admin</span>
          <Link href="/admin/review" className="font-medium text-herb hover:underline">
            Review
          </Link>
          <Link href="/admin/review/list" className="font-medium text-herb hover:underline">
            Batch list
          </Link>
          <Link href="/" className="ml-auto text-ink-muted hover:text-herb hover:underline">
            Back to site
          </Link>
        </nav>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}

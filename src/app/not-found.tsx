import { NotFoundView } from "@/components/shell/notFoundView";
import { SiteFooter } from "@/components/shell/siteFooter";
import { SiteHeader } from "@/components/shell/siteHeader";

// Next re-applies the layout's default title after hydration and drops a not-found page's metadata
// title ("Page not found" flipped to "Minced"). A <title> rendered by the page itself is hoisted by
// React and survives, so the title is set there instead.
const TITLE = "Page not found";

/*
 * Global 404: any URL that matches no route. It renders in the ROOT layout, which
 * has no header or footer (those live in the route-group layouts), so it brings the
 * site shell itself. A 404 raised inside (site) uses (site)/not-found.tsx instead.
 */
export default function GlobalNotFound() {
  return (
    <>
      <title>{TITLE}</title>
      <SiteHeader />
      <main id="main" className="flex-1">
        <NotFoundView
          title="Page not found"
          message="That address doesn't lead anywhere. The link may be old, or mistyped."
        />
      </main>
      <SiteFooter />
    </>
  );
}

import { LandingNav } from "@/components/landing/landingNav";
import { SiteFooter } from "@/components/shell/siteFooter";

/* The landing page has its own nav (no search bar: the hero is the search). */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LandingNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter flush />
    </>
  );
}

import { SiteFooter } from "@/components/shell/siteFooter";

/*
 * The landing page draws its own nav inside the hero (it sits on the photo, and there is no search bar:
 * the hero is the search). The footer continues the page's dark closing band.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter flush tone="night" />
    </>
  );
}

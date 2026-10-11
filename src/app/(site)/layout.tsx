import { SiteFooter } from "@/components/shell/siteFooter";
import { SiteHeader } from "@/components/shell/siteHeader";

/* Every page except the landing page: sticky app header, slim footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

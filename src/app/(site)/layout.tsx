import { ACCOUNT_HINT_KEY, ACCOUNT_HOLD_ID } from "@/lib/accountHint";
import { ShoppingSync } from "@/components/shopping/shoppingSync";
import { SiteFooter } from "@/components/shell/siteFooter";
import { SiteHeader } from "@/components/shell/siteHeader";

/*
 * Runs before first paint: if this browser was signed in last time, hide the header's account controls
 * until /api/me confirms (see rememberSignedIn). A timer releases the hold if that never happens.
 */
const HOLD_SCRIPT = `try{if(localStorage.getItem("${ACCOUNT_HINT_KEY}")==="1"){var s=document.createElement("style");s.id="${ACCOUNT_HOLD_ID}";s.textContent=".acct-slot{visibility:hidden}";document.head.appendChild(s);setTimeout(function(){s.remove()},3000)}}catch(e){}`;

/* Every page except the landing page: sticky app header, slim footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HOLD_SCRIPT }} />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <ShoppingSync />
    </>
  );
}

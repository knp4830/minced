import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { Nunito_Sans, Overpass_Mono, Young_Serif } from "next/font/google";
import { AccountProvider } from "@/components/account/accountProvider";
import { Suspense } from "react";
import { NavProgress } from "@/components/shell/navProgress";
import "./globals.css";
import "./polish.css";

// Display: Young Serif ships a single weight (400). Bold is never faked; see globals.css.
const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// Every measured number (min, kcal, g, servings, counts) and the uppercase eyebrow labels.
const overpassMono = Overpass_Mono({
  variable: "--font-overpass-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: { siteName: "Minced", type: "website", locale: "en_US", images: ["/og"] },
  twitter: { card: "summary_large_image", images: ["/og"] },
  title: {
    default: "Minced",
    template: "%s · Minced",
  },
  description:
    "Search for a dish, or choose ingredients and see what you can make. Save a fridge to your account to see what to cook now. Ingredients, amounts, numbered steps, and a shopping list. No essay.",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  /** Parallel route @modal: the log in / sign up dialog over the current page. */
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${youngSerif.variable} ${nunitoSans.variable} ${overpassMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only-focusable fixed top-3 left-3 z-[100] rounded-md bg-herb px-4 py-2 text-sm font-semibold text-on-herb focus:inline-flex focus:min-h-11 focus:items-center"
        >
          Skip to content
        </a>
        {/* useSearchParams needs a boundary; the bar draws nothing until a link is pressed. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <AccountProvider>
          {children}
          {modal}
        </AccountProvider>
      </body>
    </html>
  );
}

import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { AccountProvider } from "@/components/account/accountProvider";
import { Suspense } from "react";
import { NavProgress } from "@/components/shell/navProgress";
import "./globals.css";
import "./polish.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: { siteName: "Minced", type: "website", locale: "en_US" },
  twitter: { card: "summary" },
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
      className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable}`}
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

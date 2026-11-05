"use client";

import { ErrorView } from "@/components/shell/errorView";

/* A page inside the site shell failed (usually the database is briefly unreachable). The layout keeps
   the header and footer, so only the body is replaced. */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}

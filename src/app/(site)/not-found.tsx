import type { Metadata } from "next";
import { NotFoundView } from "@/components/shell/notFoundView";

export const metadata: Metadata = { title: "Page not found" };

/* A 404 raised inside the site shell: the layout already supplies header and footer. */
export default function SiteNotFound() {
  return (
    <NotFoundView
      title="Page not found"
      message="That address doesn't lead anywhere. The link may be old, or mistyped."
    />
  );
}

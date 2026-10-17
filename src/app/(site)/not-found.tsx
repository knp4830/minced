import { NotFoundView } from "@/components/shell/notFoundView";

// Next re-applies the layout's default title after hydration and drops a not-found page's metadata
// title ("Page not found" flipped to "Minced"). A <title> rendered by the page itself is hoisted by
// React and survives, so the title is set there instead.
const TITLE = "Page not found";

/* A 404 raised inside the site shell: the layout already supplies header and footer. */
export default function SiteNotFound() {
  return (
    <>
      <title>{TITLE}</title>
      <NotFoundView
        title="Page not found"
        message="That address doesn't lead anywhere. The link may be old, or mistyped."
      />
    </>
  );
}

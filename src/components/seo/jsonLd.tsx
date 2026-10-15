/**
 * Structured data. `<` is escaped so a title containing "</script>" cannot end
 * the tag early. Server component; the CSP has no script-src, so inline JSON is fine.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

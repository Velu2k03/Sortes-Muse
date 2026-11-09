/**
 * Serialise a JSON-LD object for an inline <script type="application/ld+json">.
 * Every "<" becomes the 6-character JSON escape \u003c so a value such as
 * "</script>" cannot close the script tag early. JSON.parse reads it back unchanged.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

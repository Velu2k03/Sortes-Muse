import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "../json-ld";

describe("serializeJsonLd", () => {
  it("escapes < so </script> cannot break out of the script tag", () => {
    const input = { a: "</script>" };
    const out = serializeJsonLd(input);
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
    expect(out).toBe('{"a":"\\u003c/script>"}');
    expect(JSON.parse(out)).toEqual(input);
  });

  it("round-trips nested JSON-LD unchanged", () => {
    const input = { "@context": "https://schema.org", "@graph": [{ name: "a<b", url: "https://x.test/?q=<" }] };
    const out = serializeJsonLd(input);
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual(input);
  });
});

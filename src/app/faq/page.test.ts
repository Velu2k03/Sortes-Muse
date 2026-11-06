import { describe, expect, it } from "vitest";
import { FAQS } from "./page";

describe("FAQ sign-in question", () => {
  it("Q7 mentions a sign-in link and does not promise a numeric code", () => {
    const q7 = FAQS.find((f) => f.q === "How do I sign in?");
    expect(q7).toBeDefined();
    expect(q7?.a).toContain("Email link");
    expect(q7?.a).toContain("sign-in link");
    expect(q7?.a).not.toMatch(/\bcode\b/i);
    expect(q7?.a).not.toMatch(/\bOTP\b/i);
    expect(q7?.a).not.toMatch(/\bdigit\b/i);
  });
});

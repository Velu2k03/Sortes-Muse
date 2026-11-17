import { describe, expect, it } from "vitest";
import { FAQS } from "./page";

describe("FAQ sign-in question", () => {
  it("Q7 mentions the Email link option and does not promise a numeric code", () => {
    const q7 = FAQS.find((f) => f.q === "How do I sign in?");
    expect(q7).toBeDefined();
    expect(q7?.a).toContain("Email link");
    // Phase 7 (7.3): the answer is shortened, the "sign-in link sent
    // to your email" wording is gone; "Email link" names the option.
    expect(q7?.a).not.toMatch(/\bcode\b/i);
    expect(q7?.a).not.toMatch(/\bOTP\b/i);
    expect(q7?.a).not.toMatch(/\bdigit\b/i);
  });
});

import { describe, it, expect } from "vitest";
import { INTAKE_CATEGORIES } from "@/lib/intake";

// AF-046: example question chips must be on-topic for the area the
// seeker picked (a career chip on the Love form is off-topic), and
// name/age placeholders must read as examples, never as prefilled
// values.
describe("AF-046 intake examples and placeholders", () => {
  it("gives every category three on-topic example questions", () => {
    for (const c of INTAKE_CATEGORIES) {
      expect(c.examples, `${c.key} examples`).toHaveLength(3);
      for (const ex of c.examples) {
        expect(ex.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("shows no career chip on the Love form", () => {
    const love = INTAKE_CATEGORIES.find((c) => c.key === "love");
    expect(love).toBeDefined();
    for (const ex of love!.examples) {
      expect(ex.toLowerCase()).not.toMatch(/role|job|work|promotion|career/);
    }
  });

  it("shows no love chip on the Career form", () => {
    const career = INTAKE_CATEGORIES.find((c) => c.key === "career");
    expect(career).toBeDefined();
    for (const ex of career!.examples) {
      expect(ex.toLowerCase()).not.toMatch(/partner|relationship|love/);
    }
  });

  it("marks name and age placeholders as examples, not values", () => {
    for (const c of INTAKE_CATEGORIES) {
      for (const f of c.fields) {
        if (f.placeholder && ["yourName", "partnerName", "yourAge", "partnerAge"].includes(f.key)) {
          expect(f.placeholder.startsWith("e.g. ")).toBe(true);
        }
      }
    }
  });
});

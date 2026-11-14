import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  HERO_VARIANTS,
  randomHeroVariantIndex,
} from "../hero-variants";

// Hero copy rotation (Velu, 2026-11-15): the hero H1, subhead, and
// CTA labels rotate randomly among three variants on each page load,
// not one fixed version. Velu's exact words, used verbatim. The old
// Fable H1 ("Ask a question. Draw a tarot card. Get an AI reading.")
// and subhead are retired by his decision. The title tag is metadata,
// not the H1, and does not change. The "Sortes - Get Answers to the
// Questions on Your Mind" H1 line he also listed has no H2/CTA of
// its own, so it is NOT one of the three rotating variants.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("hero rotation: the three variants (Velu's words, verbatim)", () => {
  it("has exactly three variants", () => {
    expect(HERO_VARIANTS).toHaveLength(3);
  });

  it("variant A is Find New Clarity About Your Life", () => {
    expect(HERO_VARIANTS[0]).toEqual({
      h1: "Sortes – Find New Clarity About Your Life",
      h2: "Get personal insights to help you explore love, relationships, and life's biggest questions.",
      primaryCta: "Find Your Clarity",
      secondaryCta: "Discover Readings",
    });
  });

  it("variant B is Find Clarity When Life Feels Uncertain", () => {
    expect(HERO_VARIANTS[1]).toEqual({
      h1: "Sortes – Find Clarity When Life Feels Uncertain",
      h2: "Get personal insights into love, life, and the choices ahead.",
      primaryCta: "Begin Your Reading",
      secondaryCta: "Explore Your Options",
    });
  });

  it("variant C is Discover What Your Future Could Hold", () => {
    expect(HERO_VARIANTS[2]).toEqual({
      h1: "Sortes – Discover What Your Future Could Hold",
      h2: "Explore personal insights into love, life, relationships, and the choices ahead.",
      primaryCta: "Discover Your Future",
      secondaryCta: "Explore Readings",
    });
  });

  it("the random pick is always a valid variant index", () => {
    for (let i = 0; i < 50; i++) {
      const index = randomHeroVariantIndex();
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(HERO_VARIANTS.length);
    }
  });

  it("the Get Answers line is NOT a rotating variant (no H2/CTA of its own)", () => {
    const flat = HERO_VARIANTS.map((v) => `${v.h1} ${v.h2} ${v.primaryCta} ${v.secondaryCta}`).join(" ");
    expect(flat).not.toContain("Get Answers to the Questions on Your Mind");
  });
});

describe("hero rotation: the page renders the variant, A first", () => {
  it("imports the variants and the random picker", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain(
      'import { HERO_VARIANTS, randomHeroVariantIndex } from "@/lib/hero-variants";'
    );
  });

  it("renders variant A on the server and first paint, then picks randomly after mount", () => {
    const page = src("src/app/page.tsx");
    // Initial state is index 0 (variant A): a random pick during
    // render would disagree between server and client (hydration
    // mismatch), so the random pick happens only after mount.
    expect(page).toContain("const [variantIndex, setVariantIndex] = useState(0);");
    expect(page).toContain("const variant = HERO_VARIANTS[variantIndex];");
    expect(page).toContain("setVariantIndex(randomHeroVariantIndex())");
    // The setState runs in a microtask (react-hooks/set-state-in-effect
    // is an error in this repo), inside a mount-only effect.
    expect(page).toContain("queueMicrotask(() => {");
    expect(page).toContain("}, []);");
  });

  it("the H1 renders the variant H1, not a fixed string", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(match).not.toBeNull();
    expect((match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "{variant.h1}"
    );
    // The retired Fable H1 is gone from the hero element (it may
    // still be quoted in a comment or a test, not in the <h1>).
    expect(page).not.toContain(
      ">Ask a question. Draw a tarot card. Get an AI reading.<"
    );
  });

  it("the subhead renders the variant H2, not a fixed string", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(
      /<p className="mt-6 max-w-xl text-base[^"]*">([\s\S]*?)<\/p>/
    );
    expect(match).not.toBeNull();
    expect((match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "{variant.h2}"
    );
    expect(page).not.toContain(
      ">A question on your mind? Ask the cards. Get a clearer way to see it.<"
    );
  });

  it("the submit button renders the variant primary CTA and still goes to the intake", () => {
    const page = src("src/app/page.tsx");
    const button = page.match(
      /<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/
    );
    expect(button).not.toBeNull();
    expect((button as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "{variant.primaryCta}"
    );
    // Behaviour unchanged: the form still submits to the intake,
    // and the question still travels in localStorage.
    expect(page).toContain('action="/intake/quick-insight"');
    expect(page).toContain('router.push("/intake/quick-insight")');
    expect(page).toContain("setHeroQuestion(question.trim())");
  });

  it("the secondary CTA links to the readings list and renders the variant label", () => {
    const page = src("src/app/page.tsx");
    const link = page.match(
      /<Link[^>]*href="\/spreads"[^>]*>([\s\S]*?)<\/Link>/
    );
    expect(link).not.toBeNull();
    expect((link as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "{variant.secondaryCta}"
    );
  });

  it("the free promise is still gated on freeAvailable (Batch 6a rule)", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain("Your first reading is free — no sign-up, no payment.");
    expect(page).toContain("{freeAvailable && (");
    expect(page).toContain("isFreeAvailableFor({");
  });

  it("the question box, fear line, and example chips are unchanged", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain('placeholder="What\'s on your mind?"');
    expect(page).toContain("No experience needed. Just a question.");
    expect(page).toContain("What should I focus on today?");
    expect(page).toContain("What is blocking me?");
    expect(page).toContain("EXAMPLE_QUESTIONS");
  });
});

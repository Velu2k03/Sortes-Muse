import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { HERO_COPY } from "../hero-copy";

// UX audit Phase 2, F03 + F04 + F05 (2026-11-16): the hero is ONE
// fixed headline, Velu's own from his 2026-11-15 landing choices
// (choice 11): "Ask one honest question. Draw one clear card." The
// rotation among four variants is deleted: a brand says one thing,
// the same way, every visit (101, "Strive for Simplicity"; Jakob's
// Law). The subhead names tarot in one short line (F04), and the
// single CTA is the gold submit button (F05). History: rotation was
// a deliberate Velu decision (PR #97, extended PR #100); the audit
// he ordered judged the outcome. The old Fable H1 ("Ask a question.
// Draw a tarot card. Get an AI reading.") and subhead are retired by
// his decision. The title tag is metadata, not the H1, and does not
// change.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("hero copy: one fixed headline (Velu's words, verbatim)", () => {
  it("is exactly Velu's headline, subhead, and CTA", () => {
    expect(HERO_COPY).toEqual({
      h1: "Ask one honest question. Draw one clear card.",
      h2: "A personal tarot reading for the question on your mind.",
      primaryCta: "Draw Your Card",
    });
  });

  it("the headline is 8 words and the subhead is 15 words or fewer", () => {
    expect(HERO_COPY.h1.split(/\s+/)).toHaveLength(8);
    expect(HERO_COPY.h2.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it("the subhead names tarot (F04)", () => {
    expect(HERO_COPY.h2.toLowerCase()).toContain("tarot");
  });

  it("the rotation is gone: no variants array, no random picker", () => {
    const copy = src("src/lib/hero-copy.ts");
    expect(copy).not.toContain("HERO_VARIANTS");
    expect(copy).not.toContain("randomHeroVariantIndex");
    expect(copy).not.toContain("Find Your Clarity");
    expect(copy).not.toContain("Begin Your Reading");
    expect(copy).not.toContain("Discover Your Future");
    expect(copy).not.toContain("Find New Clarity About Your Life");
    expect(copy).not.toContain("Find Clarity When Life Feels Uncertain");
    expect(copy).not.toContain("Discover What Your Future Could Hold");
  });
});

describe("hero copy: the page renders the fixed copy", () => {
  it("imports the fixed copy, not the variants", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain(
      'import { HERO_COPY } from "@/lib/hero-copy";'
    );
    expect(page).not.toContain("HERO_VARIANTS");
    expect(page).not.toContain("randomHeroVariantIndex");
    expect(page).not.toContain("variantIndex");
  });

  it("the H1 renders the fixed headline", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(match).not.toBeNull();
    expect((match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "{HERO_COPY.h1}"
    );
    // The retired Fable H1 is gone from the hero element (it may
    // still be quoted in a comment or a test, not in the <h1>).
    expect(page).not.toContain(
      ">Ask a question. Draw a tarot card. Get an AI reading.<"
    );
  });

  it("the subhead renders the fixed subhead, not a variant", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(
      /<p className="mt-4 max-w-xl text-base[^"]*">([\s\S]*?)<\/p>/
    );
    expect(match).not.toBeNull();
    expect((match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "{HERO_COPY.h2}"
    );
    expect(page).not.toContain(
      ">A question on your mind? Ask the cards. Get a clearer way to see it.<"
    );
  });

  it("the submit button renders the fixed CTA and still goes to the intake", () => {
    const page = src("src/app/page.tsx");
    const button = page.match(
      /<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/
    );
    expect(button).not.toBeNull();
    expect((button as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "{HERO_COPY.primaryCta}"
    );
    // Behaviour unchanged: the form still submits to the intake,
    // and the question still travels in localStorage.
    expect(page).toContain('action="/intake/quick-insight"');
    expect(page).toContain('router.push("/intake/quick-insight")');
    expect(page).toContain("setHeroQuestion(question.trim())");
  });

  it("there is no secondary CTA in the hero (F05, one primary action)", () => {
    const page = src("src/app/page.tsx");
    expect(page).not.toContain('href="/spreads"');
    expect(page).not.toContain("Explore Readings");
    expect(page).not.toContain("Discover Readings");
    expect(page).not.toContain("Explore Your Options");
  });

  it("the free promise is still gated on freeAvailable (Batch 6a rule)", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain("Your first reading is free — no sign-up, no payment.");
    expect(page).toContain("{freeAvailable && (");
    expect(page).toContain("isFreeAvailableFor({");
  });

  it("the question box and example chips are unchanged", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain('placeholder="What\'s on your mind?"');
    expect(page).toContain("What should I focus on today?");
    expect(page).toContain("What is blocking me?");
    expect(page).toContain("EXAMPLE_QUESTIONS");
  });
});

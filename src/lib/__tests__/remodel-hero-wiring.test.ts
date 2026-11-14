import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Remodel Phase 1 batch 1 (Velu, 2026-11-14, Fable's review): the
// hero is the product. The H1 is Fable's explanation, the subhead is
// Fable's fix, "Sortes" lives in the header logo, and the question
// box starts the reading on the homepage. The one-word brand H1
// (Batch 11) and the Batch 12 subhead are superseded. The free
// reading stays 1-card Quick Insight only, and the 3-card spread is
// PLANNED as the next step after the first reading — so the hero
// must NOT promise three cards. Copy is asserted on the actual JSX
// elements, not the whole file: the comment above the H1 quotes the
// change, so a whole-file toContain would pass even if the element
// were reverted (Sonnet review lesson from Batch 12).
//
// Sonnet review (NEEDS CHANGES, fixed in this batch) and the PR
// reviews (CodeRabbit Major, Copilot, Codex — all fixed in this
// batch): the "free" wording is gated on freeAvailable (Batch 6a
// rule, ReturnLoop pattern), the hero question is consumed only once
// the intake is usable (gate null) AND the device flags are known
// (draftReady), the slug is checked before the destructive read, an
// empty submit overwrites a stale pending question, and the handoff
// lives in localStorage with a 1-hour expiry so an email-link sign-in
// (new tab) does not lose it.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Remodel hero: explanation H1, question box, example questions", () => {
  it("the H1 is Fable's explanation, not the one-word brand", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(match).not.toBeNull();
    const h1 = (match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(h1).toBe("Ask a question. Draw a tarot card. Get an AI reading.");
    expect(h1).not.toBe("Sortes");
  });

  it("the subhead is Fable's fix and does not promise a clear answer", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(
      /<p className="mt-6 max-w-xl text-base[^"]*">([\s\S]*?)<\/p>/
    );
    expect(match).not.toBeNull();
    const subhead = (match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(subhead).toBe(
      "A question on your mind? Ask the cards. Get a clearer way to see it."
    );
    expect(subhead).not.toContain("Get a clear answer");
    const flat = page.replace(/\s+/g, " ");
    expect(flat).not.toMatch(/(draw|pick)\s+(three|3)\s+cards?/i);
  });

  it("the fear line is short: no experience needed", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("No experience needed. Just a question.");
  });

  it("the hero has a question box with a gold submit button", () => {
    const page = src("src/app/page.tsx");
    const flat = page.replace(/\s+/g, " ");
    expect(flat).toContain('placeholder="What\'s on your mind?"');
    // The "free" wording is gated: it shows only when the first
    // reading is actually free, and fails closed while auth is
    // loading (Batch 6a rule, ReturnLoop pattern).
    expect(flat).toContain(
      'freeAvailable ? "Draw my card — free" : "Draw my card"'
    );
    expect(flat).toContain("isFreeAvailableFor");
    expect(flat).toContain("<form");
    expect(flat).toContain('type="submit"');
    // Pre-hydration fallback: the form navigates to the intake even
    // before hydration, and the input caps at the server's 300.
    expect(flat).toContain('action="/intake/quick-insight"');
    expect(flat).toContain("maxLength={300}");
    // The old link button is gone; the form submits to the intake.
    expect(flat).not.toContain("Ask your question");
    expect(flat).toContain('router.push("/intake/quick-insight")');
  });

  it("the hero input keeps the global focus-visible ring", () => {
    const page = src("src/app/page.tsx");
    // Sonnet review: focus:outline-none removed the global gold 2px
    // :focus-visible outline, leaving only a border-colour change.
    const input = page.match(/<input[^>]*id="hero-question"[^>]*>/);
    expect(input).not.toBeNull();
    expect((input as RegExpMatchArray)[0]).not.toContain("focus:outline-none");
  });

  it("has 3-4 tappable example questions under the input", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("What should I focus on today?");
    expect(page).toContain("Is this the right move?");
    expect(page).toContain("What is blocking me?");
    expect(page).toContain("What does the week ahead hold?");
    expect(page).toContain("EXAMPLE_QUESTIONS");
    expect(page).toContain("fillExample");
    // Sonnet review: the chips are a labelled group with 44px
    // touch targets (fieldset + legend, not role="group": the repo
    // lints role="group" against the jsx-a11y baseline).
    expect(page).toContain("<legend");
    expect(page).toContain("Example questions</legend>");
    expect(page).toContain("min-h-11");
  });

  it("the friction line promises free with no sign-up and no payment, gated on free", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("Your first reading is free — no sign-up, no payment.");
    expect(page).toContain("{freeAvailable && (");
    expect(page).not.toContain("No credit card, no account.");
  });

  it("the privacy line says what happens to a typed question", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    // Sonnet review: "for this reading only" read as "not stored",
    // but the question is saved with the reading in the journal
    // (local for guests, server history when signed in).
    expect(page).toContain(
      "Sent to the AI to write your reading. Saved with it in your journal."
    );
  });

  it("the hero question travels to the intake in localStorage, not the URL", () => {
    const storage = src("src/lib/storage.ts");
    expect(storage).toContain("export function setHeroQuestion");
    expect(storage).toContain("export function takeHeroQuestion");
    expect(storage).toContain("export function peekHeroQuestion");
    expect(storage).toContain("HERO_QUESTION_TTL_MS");
    // localStorage, not sessionStorage: an email-link sign-in opens a
    // new tab, and the return destination already survives through
    // localStorage. One-time read with a 1-hour expiry.
    expect(storage).toContain("write(K.heroQuestion, { q, at: Date.now() })");
    const page = src("src/app/page.tsx");
    expect(page).toContain("setHeroQuestion");
    // Review fixes: an empty submit overwrites (clears) a stale
    // pending question instead of leaving it to prefill later.
    expect(page).toContain("setHeroQuestion(question.trim())");
    const hook = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(hook).toContain("takeHeroQuestion");
    expect(hook).toContain("peekHeroQuestion");
    // Review fixes: consume only once the intake is usable (gate
    // null) AND the device flags are known (draftReady), or a guest
    // who leaves to sign in loses the typed question. The slug is
    // checked BEFORE the destructive read, so another spread's intake
    // cannot discard the Quick Insight question. A pending hero
    // question discards the old draft instead of merging with it.
    expect(hook).toContain("gate !== null || !draftReady");
    expect(hook).toContain('if (slug !== "quick-insight") return;');
    expect(hook).toContain("clearIntakeDraft()");
    expect(hook).toContain('slug === "quick-insight"');
  });
});

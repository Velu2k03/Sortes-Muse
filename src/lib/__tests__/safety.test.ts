import { describe, it, expect } from "vitest";
import {
  appendClosings,
  detectSupportTier,
  FINANCES_CLOSE,
  HEALTH_CLOSE,
  isCategory,
  mentionsHealth,
  NO_CREDITS_LINE,
  supportPanel,
} from "@/lib/safety";

// The exact live-test question (capture 3 in capture_topic7.py).
const CAPTURE_3 = "I feel like giving up. Nothing feels worth it anymore. What should I do?";

describe("detectSupportTier: Tier A (explicit self-harm)", () => {
  it.each([
    "I want to kill myself",
    "I want to end my life",
    "I don't want to live anymore",
    "I don’t want to live anymore", // curly apostrophe
    "I dont want to live anymore",
    "I have been thinking about suicide",
    "I want to hurt myself",
    "Should I just end it all?",
    "I'm suicidal and I don't know what to do",
    "Everyone would be better off without me",
    "I keep having suicidal thoughts",
    "I WANT TO DIE",
  ])("Tier A: %s", (text) => {
    expect(detectSupportTier(text)).toBe("A");
  });

  it("checks every text it is given (story, answers), not only the question", () => {
    expect(detectSupportTier("Will my job get better?", "Honestly I want to end my life.")).toBe("A");
  });

  it("Tier A wins when Tier B language is also present", () => {
    expect(detectSupportTier("I feel hopeless and I want to kill myself")).toBe("A");
  });
});

describe("detectSupportTier: Tier B (hopelessness / giving up)", () => {
  it("the exact capture-3 live-test question is Tier B", () => {
    expect(detectSupportTier(CAPTURE_3)).toBe("B");
  });

  it.each([
    "I feel hopeless about everything",
    "Nothing feels worth it",
    "I feel like giving up",
    "I can't go on like this",
    "I'm hopeless, what now?",
    "I've lost all hope",
    "I can't take it anymore",
  ])("Tier B: %s", (text) => {
    expect(detectSupportTier(text)).toBe("B");
  });
});

describe("detectSupportTier: false-positive controls (no tier)", () => {
  it.each([
    "What does the Death card mean?",
    "I want to kill my presentation at work",
    "I feel dead tired after the night shift",
    "What does the Tower mean in my career spread?",
    "Why did the Ten of Swords show up reversed?",
    "The Death card and the Tower came up together. Is that bad?",
    "I want to dye my hair red, will it suit me?",
    "Will my killer business idea work?",
    "I'm a Cancer, what does this year hold for my love life?",
    "Should I give up my second job to study?",
    "",
  ])("no tier: %s", (text) => {
    expect(detectSupportTier(text)).toBeNull();
  });

  it("no tier for missing text", () => {
    expect(detectSupportTier(undefined, null)).toBeNull();
  });
});

describe("supportPanel", () => {
  it("Tier A: helpline link, local emergency number, and the exact no-credits line", () => {
    const p = supportPanel("A");
    expect(p.tier).toBe("A");
    expect(p.helplineUrl).toBe("https://findahelpline.com");
    expect(p.emergencyLine).toContain("call your local emergency number");
    expect(p.noCreditsLine).toBe("No credits were spent.");
    expect(NO_CREDITS_LINE).toBe("No credits were spent.");
  });

  it("Tier B: one gentle reach-out prompt, and never claims no credits (a reading was made)", () => {
    const p = supportPanel("B");
    expect(p.tier).toBe("B");
    expect(p.prompt).toMatch(/someone you trust/);
    expect(p.prompt).toMatch(/helpline/);
    expect(p.helplineUrl).toBe("https://findahelpline.com");
    expect(p.emergencyLine).toContain("call your local emergency number");
    expect(p.noCreditsLine).toBeUndefined();
  });

  it("makes no prediction or outcome claim", () => {
    for (const tier of ["A", "B"] as const) {
      const p = supportPanel(tier);
      const all = `${p.title} ${p.message} ${p.prompt ?? ""}`.toLowerCase();
      expect(all).not.toMatch(/will be (?:ok|okay|fine|better)|everything will|guarantee/);
    }
  });
});

describe("mentionsHealth (S2)", () => {
  it.each([
    "I was diagnosed last month, what should I focus on?",
    "My mother has a serious illness",
    "I just found out I'm pregnant",
    "My dad is in hospital",
    "My doctor wants more tests",
    "The symptoms keep coming back",
    "Should I worry about my new medication?",
  ])("health: %s", (text) => {
    expect(mentionsHealth(text)).toBe(true);
  });

  it.each([
    "Will I get the promotion this year?",
    "I'm a Cancer sun, what about love?",
    "I am sick of my job",
    "What should I focus on next?",
  ])("not health: %s", (text) => {
    expect(mentionsHealth(text)).toBe(false);
  });
});

describe("isCategory", () => {
  it("matches the intake key and the saved display name", () => {
    expect(isCategory("health", "health")).toBe(true);
    expect(isCategory("Health and Wellness", "health")).toBe(true);
    expect(isCategory("finances", "finances")).toBe(true);
    expect(isCategory("Finances and Money", "finances")).toBe(true);
    expect(isCategory("Career and Work", "finances")).toBe(false);
    expect(isCategory(undefined, "health")).toBe(false);
  });
});

describe("appendClosings", () => {
  it("appends each missing closing once, in order, and reports what it added", () => {
    const r = appendClosings("Body.", [HEALTH_CLOSE, FINANCES_CLOSE]);
    expect(r.text).toBe(`Body.\n\n${HEALTH_CLOSE}\n\n${FINANCES_CLOSE}`);
    expect(r.appended).toBe(`\n\n${HEALTH_CLOSE}\n\n${FINANCES_CLOSE}`);
  });

  it("does not duplicate a closing the text already has", () => {
    const r = appendClosings(`Body.\n\n${FINANCES_CLOSE}`, [FINANCES_CLOSE]);
    expect(r.appended).toBe("");
    expect(r.text.split(FINANCES_CLOSE).length).toBe(2);
  });
});

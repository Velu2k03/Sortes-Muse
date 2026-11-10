import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src";

// Batch 6a (Claude Fable audit section 5): the slop set is gone from
// every non-test source file. The test file itself names the phrases,
// so test files are excluded from the scan (same pattern as the
// Batch 2a typewriter guard).
const BANNED = [
  "What do you seek?",
  "one clear mirror",
  "A mirror for the mind",
  "small mirror for the day",
  "mirror, not a map",
  "A daily ritual",
  "Meet a few of the cards",
  "Breathe slowly",
  "Weaving the cards together",
  "woven around it",
  "Take what resonates, leave the rest",
  "Unveiling your reflection",
  "Ready to cast the lots?",
  "It travels with the reading",
  "Still turning it over?",
  "Written for you in this moment",
  "Keep-forever",
  "Print keepsake",
  "Lost in the stars",
  "Write your step first",
  "Computed from your own readings only",
  "fixed-rule suggestion, not from AI",
  // Review round: the prompt example lists and the guide/card copy.
  '"a mirror for"',
  "Readings are mirrors for reflection",
  "Usually under a minute",
  "Only your first name is ever shared with the AI",
  "if that ever changes, this page will say so first",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...sourceFiles(path));
    } else if ((path.endsWith(".ts") || path.endsWith(".tsx")) && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx")) {
      out.push(path);
    }
  }
  return out;
}

const src = (p: string) => readFileSync(p, "utf8");

describe("Batch 6a wiring", () => {
  it("no slop phrase from the audit remains in non-test source", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50);
    const hits: string[] = [];
    for (const file of files) {
      const text = src(file);
      for (const phrase of BANNED) {
        if (text.includes(phrase)) hits.push(`${file}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the replacements are in place", () => {
    expect(src("src/app/page.tsx")).toContain("What&apos;s on your mind?");
    expect(src("src/app/page.tsx")).toContain("One card for one question.");
    expect(src("src/app/page.tsx")).toContain("Tarot helps you think. It doesn&apos;t predict.");
    expect(src("src/app/page.tsx")).toContain("Browse all 78 cards.");
    expect(src("src/lib/tarot.ts")).toContain("One card for one question.");
    expect(src("src/components/ReadingWait.tsx")).toContain("Writing your reading.");
    expect(src("src/components/ReadingWait.tsx")).toContain('"Putting it together",');
    expect(src("src/app/intake/[slug]/IntakeSteps.tsx")).toContain("Check and draw");
    expect(src("src/app/intake/[slug]/IntakeSteps.tsx")).toContain("We&apos;ll include it in your reading.");
    expect(src("src/app/intake/[slug]/IntakeSteps.tsx")).toContain("Tell us what&apos;s going on.");
    expect(src("src/app/reading/[id]/ReadingSections.tsx")).toContain("Ask a follow-up");
    expect(src("src/components/HeirloomPrint.tsx")).toContain("Print or save as PDF");
    expect(src("src/app/not-found.tsx")).toContain("Page not found");
    expect(src("src/app/horoscope/HoroscopeClient.tsx")).toContain("Loading…");
    expect(src("src/components/ReadingFlow.tsx")).toContain("the reading is written for your question");
    expect(src("src/app/intake/[slug]/page.tsx")).toContain("your reading can be written for your question");
    expect(src("src/app/api/reading/generate/route.ts")).toContain("open with the question itself, not a greeting like 'Hello, friend'");
  });

  it("the confirm step keeps the charge timing and the AI disclosure", () => {
    // Review B1: the deleted paragraph was the only place that said
    // when the Oracle is spent and what happens on failure. One line
    // keeps it. Verified against the generate route: the client never
    // spends, the route spends after generation, and a failed
    // generation spends nothing.
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("Nothing is charged until you reveal your reading.");
    expect(steps).toContain("you aren&apos;t charged.");
    expect(steps).toContain("Your story goes to the AI for");
    expect(src("src/app/intake/[slug]/page.tsx")).toContain("Your story goes to the AI for this reading only.");
  });

  it("the wait screen and the prompts carry no unmeasured or mirror claims", () => {
    expect(src("src/components/ReadingWait.tsx")).toContain("Writing your reading.");
    expect(src("src/components/ReadingWait.tsx")).toContain('"Putting it together",');
    for (const file of [
      "src/app/api/reading/generate/route.ts",
      "src/app/api/reports/generate/route.ts",
      "src/app/api/chart/interpret/route.ts",
    ]) {
      expect(src(file)).not.toContain('"a mirror for"');
    }
    expect(src("src/components/CardModal.tsx")).toContain("Readings are for reflection, not predictions");
    expect(src("src/lib/guides.ts")).toContain("a tool for reflection");
  });

  it("the confirm step keeps one cost line plus a Privacy link, no disclaimer wall", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain('href="/privacy"');
    expect(steps).not.toContain("Only your first name and story essentials are sent to the AI.");
    expect(steps).not.toContain("What happens next: cards are drawn");
  });

  it("the free lines are gated on the server/device flag, never raw", () => {
    // The helper call legitimately passes deviceFree: !usedFree; the
    // point is the LABEL reads freeAvailable (the helper's verdict),
    // never the raw device flag the way the Batch 1 re-check caught
    // in SpreadsClient.
    for (const file of ["src/app/journal/HistoryClient.tsx", "src/components/ReturnLoop.tsx"]) {
      const text = src(file);
      expect(text).toContain("isFreeAvailableFor");
      expect(text).toContain("freeReadingAvailable");
      expect(text).toContain("{freeAvailable");
    }
    expect(src("src/app/birth-card/page.tsx")).toContain("Start a reading");
    expect(src("src/app/birth-card/page.tsx")).not.toContain("Start a free reading");
  });

  it("purchase history shows Oracles and a friendly test-grant label", () => {
    const panels = src("src/app/account/AccountPanels.tsx");
    expect(panels).toContain("{t.readings} Oracles");
    expect(panels).toContain('"Test grant"');
    expect(panels).not.toContain("{t.readings} readings");
  });

  it("the account page subhead is gone; the card copy stays", () => {
    expect(src("src/app/account/page.tsx")).not.toContain("Sign in to sync them across devices.");
    expect(src("src/app/account/AccountClient.tsx")).toContain("Sign in to sync everything");
  });
});

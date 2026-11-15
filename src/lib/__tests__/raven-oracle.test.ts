import path from "path";
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  RAVEN_BUST_BELOW,
  RAVEN_MIN_SIZE,
  RAVEN_STATES,
  ravenClassForState,
  ravenProfileForState,
  ravenSizeFor,
  ravenVariantForSize,
} from "@/lib/raven-oracle";

// Raven Oracle Step 1 (Velu, 2026-11-15; Fable decision 2026-11-15):
// the Duolingo-style reactive mascot, adapted for Sortes. Gentle and
// wise only: no guilt, no sick, no dead, no streak pressure. The
// final art is C4 (chubby front-facing raven). Six states are the
// semantic API; they map to THREE motion profiles in code, because
// one static image cannot show six visibly different ravens.
//
// Test shape: direct unit tests for the pure helpers in
// src/lib/raven-oracle.ts, plus the repo wiring-test pattern
// (readFileSync on source) for the component and its callers.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("RavenOracle state machine", () => {
  it("defines exactly the six gentle states", () => {
    expect([...RAVEN_STATES]).toEqual([
      "idle",
      "listening",
      "thinking",
      "revealing",
      "gentle",
      "celebrating",
    ]);
    // No guilt/sick/dead states: the type is the whole state space.
    expect(RAVEN_STATES.join(" ")).not.toMatch(/guilt|sick|dead|punish/);
  });

  it("maps six states to three motion profiles", () => {
    expect(ravenProfileForState("idle")).toBe("rest");
    expect(ravenProfileForState("gentle")).toBe("rest");
    expect(ravenProfileForState("listening")).toBe("rest");
    expect(ravenProfileForState("thinking")).toBe("thinking");
    expect(ravenProfileForState("revealing")).toBe("thinking");
    expect(ravenProfileForState("celebrating")).toBe("celebrating");
  });

  it("adds the listening lean, and only for listening", () => {
    expect(ravenClassForState("listening")).toBe(
      "raven-oracle raven-oracle--rest raven-oracle--lean",
    );
    expect(ravenClassForState("idle")).toBe("raven-oracle raven-oracle--rest");
    expect(ravenClassForState("thinking")).toBe("raven-oracle raven-oracle--thinking");
    expect(ravenClassForState("celebrating")).toBe(
      "raven-oracle raven-oracle--celebrating",
    );
  });

  it("clamps size to a 40px minimum and switches to the bust below 96px", () => {
    expect(RAVEN_MIN_SIZE).toBe(40);
    expect(RAVEN_BUST_BELOW).toBe(96);
    expect(ravenSizeFor(20)).toBe(40);
    expect(ravenSizeFor(39)).toBe(40);
    expect(ravenSizeFor(64)).toBe(64);
    expect(ravenVariantForSize(240, "auto")).toBe("full");
    expect(ravenVariantForSize(120, "auto")).toBe("full");
    expect(ravenVariantForSize(96, "auto")).toBe("full");
    expect(ravenVariantForSize(95, "auto")).toBe("bust");
    expect(ravenVariantForSize(64, "auto")).toBe("bust");
    expect(ravenVariantForSize(40, "auto")).toBe("bust");
    expect(ravenVariantForSize(240, "bust")).toBe("bust");
    expect(ravenVariantForSize(64, "full")).toBe("full");
  });
});

describe("RavenOracle component", () => {
  it("uses the C4 static WebP imports, never a public/ path", () => {
    const component = src("src/components/RavenOracle.tsx");
    expect(component).toContain('from "@/assets/raven-oracle-full.webp"');
    expect(component).toContain('from "@/assets/raven-oracle-bust.webp"');
    expect(component).not.toContain("/raven-oracle.png");
    expect(component).not.toContain("public/");
  });

  it("is decorative: aria-hidden with an empty alt, sizes per placement", () => {
    const component = src("src/components/RavenOracle.tsx");
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain('alt=""');
    expect(component).toContain("sizes={`${px}px`}");
  });

  it("uses preload, not the deprecated priority prop", () => {
    const component = src("src/components/RavenOracle.tsx");
    expect(component).toContain("preload={preload}");
    expect(component).not.toContain("priority=");
  });

  it("is deterministic: no state, effect, or randomness, so it adds no client variance", () => {
    const component = src("src/components/RavenOracle.tsx");
    expect(component).not.toMatch(/useState|useEffect|Math\.random|Date\.now/);
  });

  it("touches no pricing, Oracle, or free-reading logic", () => {
    const component = src("src/components/RavenOracle.tsx");
    const lib = src("src/lib/raven-oracle.ts");
    for (const text of [component, lib]) {
      expect(text).not.toMatch(/CREDIT_COSTS_ENABLED|credit|price|free-reading|intake-gate/i);
    }
  });

  it("has CSS motion on the wrapper for the three profiles, plus the dark disc and glow", () => {
    const css = src("src/components/RavenOracle.css");
    expect(css).toContain("@keyframes raven-bob");
    expect(css).toContain("@keyframes raven-sway");
    expect(css).toContain("@keyframes raven-hop");
    expect(css).toContain("@keyframes raven-glow");
    expect(css).toContain(".raven-oracle--rest");
    expect(css).toContain(".raven-oracle--thinking");
    expect(css).toContain(".raven-oracle--celebrating");
    expect(css).toContain(".raven-oracle--lean");
    // The hop is one-shot, not a loop.
    expect(css).toContain("raven-hop 0.6s ease 1");
    // Dark-on-dark fix: cream radial disc + gold drop-shadow, both
    // token-driven and dark-theme only.
    expect(css).toContain("radial-gradient");
    expect(css).toContain("var(--color-cream)");
    expect(css).toContain("var(--color-goldbright)");
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain("drop-shadow");
    expect(css).not.toContain("url(");
  });

  it("adds no new reduced-motion handling: the global rule covers it", () => {
    const css = src("src/components/RavenOracle.css");
    const component = src("src/components/RavenOracle.tsx");
    expect(css).not.toContain("prefers-reduced-motion");
    expect(css).not.toContain("matchMedia");
    expect(component).not.toContain("matchMedia");
    expect(component).not.toContain("useReducedMotion");
    const globals = src("src/app/globals.css");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("RavenOracle wiring", () => {
  it("wait screen shows thinking while streaming, revealing when done", () => {
    const wait = src("src/components/ReadingWait.tsx");
    expect(wait).toContain("RavenOracle");
    expect(wait).toContain('state={complete ? "revealing" : "thinking"}');
  });

  it("intake form listens while the user types the question", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("RavenOracle");
    expect(steps).toContain('state="listening"');
  });

  it("reading detail celebrates a fresh reveal with a hop, gentle on revisit, no burst", () => {
    const detail = src("src/app/reading/[id]/ReadingDetailClient.tsx");
    expect(detail).toContain("RavenOracle");
    expect(detail).toContain("sortes-just-revealed");
    expect(detail).toContain('state={justRevealed ? "celebrating" : "gentle"}');
    // No raven-owned burst: TarotCard already fires one on reveal.
    expect(detail).not.toContain("CardBurst");
  });

  it("intake marks a reading as just revealed before navigating to it", () => {
    const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(flow).toContain("sortes-just-revealed");
  });

  it("daily page greets gently, shows the never-reset count line, and fires no burst", () => {
    const daily = src("src/app/daily/page.tsx");
    expect(daily).toContain("RavenOracle");
    expect(daily).toContain("the Raven remembers");
    // The count never resets: the line uses practice days, not a streak.
    expect(daily).toContain("getDailyPracticeDays");
    expect(daily).not.toContain("getDailyStreak");
    expect(daily).not.toContain("CardBurst");
  });

  it("the burst still lives where it belongs: TarotCard on reveal", () => {
    const card = src("src/components/TarotCard.tsx");
    expect(card).toContain("CardBurst");
  });
});

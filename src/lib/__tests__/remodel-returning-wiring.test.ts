import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Remodel Phase 1 batch 3 (Velu, 2026-11-14): the returning-user
// home. Velu's Option B (2026-11-14, "Show the hero to all
// signed-out guests") supersedes the Batch 3 four-signal rule:
// the hero shows to EVERY signed-out guest, and ReturningHome
// only when signed in. A signed-in visitor gets the returning
// home instead of the cold landing copy. No separate route. Copy
// is asserted on the actual JSX elements, not the whole file: the
// comments above the copy quote it, so a whole-file toContain
// would pass even if the element were reverted (Sonnet review
// lesson from Batch 12).
//
// MagicBento (the plan's pick for the "Your thread" cards) is NOT
// used: Batch 2 already proved its vendored file fails the repo
// lint out of the box (4 react-hooks/refs errors + 1 no-img-element
// warning), hand-editing generated files is forbidden, and the
// outcome has not changed since. The existing card styles stay.
// Measurement (PostHog) is NOT wired: the go-ahead is still
// pending, so nothing in this batch tracks anything.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Remodel returning home: dynamic homepage switch", () => {
  it("switches to the returning home only when signed in, no separate route", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain('import ReturningHome from "@/components/ReturningHome"');
    expect(page).toContain("if (isReturning)");
    expect(page).toContain("<ReturningHome />");
    // Velu's Option B (2026-11-14): ReturningHome only when signed
    // in. The Batch 3 four-signal rule is superseded — the device
    // flags no longer drive the switch.
    expect(page).toContain("const isReturning = !!user;");
    expect(page).not.toContain("usedFree || hasHistory || drewToday");
    expect(page).not.toContain("signalsReady");
    expect(page).not.toContain("setHasHistory");
    expect(page).not.toContain("setDrewToday");
    // The switch is an early return before the hero, not a route.
    expect(page.indexOf("if (isReturning)")).toBeLessThan(
      page.indexOf("Ask a question. Draw a tarot card. Get an AI reading.")
    );
    expect(page).not.toContain("/dashboard");
    expect(src("src/components/ReturningHome.tsx")).not.toContain("/dashboard");
  });

  it("new visitors still get the cold landing copy", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain("Ask a question. Draw a tarot card. Get an AI reading.");
    expect(page).toContain("<TodaySample />");
    expect(page).toContain("How it works");
    expect(page).toContain("<ReturnLoop />");
  });
});

describe("Hero for all signed-out guests (Velu's Option B, 2026-11-14)", () => {
  it("a signed-out guest who used the free reading sees the hero without the free promise", () => {
    const page = src("src/app/page.tsx");
    // The switch ignores the device flag: usedFree is not part of
    // isReturning, so the guest gets the hero, not the returning home.
    expect(page).toContain("const isReturning = !!user;");
    expect(page).not.toContain("usedFree || hasHistory || drewToday");
    // But the free promise still respects the flag: freeAvailable
    // reads deviceFree from !usedFree, so a used-free guest sees
    // the hero WITHOUT the free wording.
    expect(page).toContain("isFreeAvailableFor({");
    expect(page).toContain("deviceFree: !usedFree,");
    // The free wording is gated on the actual JSX elements: the
    // button ternary and the friction line's freeAvailable guard.
    const button = page.match(
      /<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/
    );
    expect(button).not.toBeNull();
    expect((button as RegExpMatchArray)[1]).toContain(
      'freeAvailable ? "Draw my card — free" : "Draw my card"'
    );
    expect(page).toContain("{freeAvailable && (");
  });

  it("a signed-out guest with journal history sees the hero", () => {
    const page = src("src/app/page.tsx");
    // History is no longer read for the switch at all: no history
    // signal, no history import on this page (ReturningHome reads
    // it itself, signed-in only).
    expect(page).not.toContain("getHistory");
    expect(page).not.toContain("hasHistory");
    expect(page).toContain("const isReturning = !!user;");
  });

  it("a signed-out guest who drew today's card sees the hero", () => {
    const page = src("src/app/page.tsx");
    // Same for the daily card: no daily signal on this page (the
    // sample section and ReturningHome read it themselves).
    expect(page).not.toContain("getDailyCard");
    expect(page).not.toContain("drewToday");
    expect(page).toContain("const isReturning = !!user;");
  });

  it("auth loading shows the hero: no ReturningHome flash for a guest", () => {
    const page = src("src/app/page.tsx");
    // isReturning is exactly !!user: while auth is loading user is
    // null (AuthProvider starts null with loading true), so the
    // hero renders. The switch waits on nothing else.
    expect(page).toContain("const isReturning = !!user;");
    expect(page).not.toContain("signalsReady");
    // And the free wording fails closed while loading, so the hero
    // never promises a free reading before the flags are known.
    expect(page).toContain("!authLoading &&");
  });
});

describe("ReturningHome: greeting, today's card, cost-labelled button, balance", () => {
  it("greets by time of day and shows the date", () => {
    const home = src("src/components/ReturningHome.tsx");
    const h1 = home.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect((h1 as RegExpMatchArray)[1]).toContain("{greeting}");
    expect((h1 as RegExpMatchArray)[1]).toContain("{name}");
    expect(home).toContain('if (h < 12) return "Good morning";');
    expect(home).toContain('if (h < 18) return "Good afternoon";');
    expect(home).toContain('return "Good evening";');
    expect(home).toContain(
      'toLocaleDateString("en-GB", {\n    weekday: "long",\n    day: "numeric",\n    month: "long",\n  })'
    );
  });

  it("shows today's card large with one line, or the not-drawn prompt", () => {
    const home = src("src/components/ReturningHome.tsx");
    // The /daily route's stored draw, not a new picker (same reuse
    // as TodaySample: no date-seeded pick exists in the repo).
    expect(home).toContain("getDailyCard()");
    expect(home).not.toContain("drawSingle");
    expect(home).toContain("orientationMeaning(card, daily.reversed)");
    expect(home).toContain("firstSentence");
    expect(home).toContain('src={card.image}');
    expect(home).toContain("{card.name}");
    // Drawn: see it. Not drawn: a plain prompt, not a placeholder
    // card. A second draw the same day returns the same stored
    // card on /daily, so nothing here promises another one.
    expect(home).toContain("See today&apos;s card");
    expect(home).toContain("You have not drawn today&apos;s card yet.");
    expect(home).toContain("Draw today&apos;s card");
    expect(home).not.toContain("draw today&apos;s card again");
    const dailyLinks = [...home.matchAll(/<Link[^>]*href="\/daily"[^>]*>([\s\S]*?)<\/Link>/g)].map(
      (m) => m[1].replace(/\s+/g, " ").trim()
    );
    expect(dailyLinks).toContain("See today&apos;s card");
    expect(dailyLinks).toContain("Draw today&apos;s card");
  });

  it("has one button with its cost labelled, gated on the free rule", () => {
    const home = src("src/components/ReturningHome.tsx");
    expect(home).toContain("isFreeAvailableFor({");
    expect(home).toContain('slug: "quick-insight"');
    expect(home).toContain(
      'freeAvailable ? "Ask today\'s question — free" : "Ask today\'s question · 1 Oracle"'
    );
    expect(home).toContain('href="/intake/quick-insight"');
  });

  it("shows the Oracle balance with a top-up link", () => {
    const home = src("src/components/ReturningHome.tsx");
    expect(home).toContain("Your balance:");
    expect(home).toContain("Oracles");
    expect(home).toContain("Your balance is loading.");
    expect(home).toContain('href="/oracles"');
    expect(home).toContain("Top up");
  });

  it("never promises a first free reading", () => {
    const home = src("src/components/ReturningHome.tsx");
    // Velu's Option B (2026-11-14): a signed-out guest who used the
    // free reading lands on the hero now, not here — ReturningHome
    // is signed-in only. The guard still holds: no copy in this
    // file offers the first reading again (the button's free
    // wording is "Ask today's question — free", gated on the
    // server record).
    expect(home).not.toContain("first reading is free");
    expect(home).not.toContain("Your first reading is free");
    expect(home).not.toContain("Draw my card — free");
  });
});

describe("ReturningHome: Your thread and day-1/day-2 states", () => {
  it("shows the last reading and the cards that keep appearing", () => {
    const home = src("src/components/ReturningHome.tsx");
    const h2s = [...home.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) =>
      m[1].replace(/\s+/g, " ").trim()
    );
    expect(h2s).toContain("Your thread");
    expect(home).toContain("Last reading");
    expect(home).toContain("Cards that keep appearing");
    // Reuse: journal from storage, server history merged the same
    // way ReturnLoop and the journal page do — no new data source.
    expect(home).toContain("getHistory()");
    expect(home).toContain('fetch("/api/history")');
    expect(home).toContain("getDailyStreak()");
    expect(home).toContain("× ${r.count}");
    // Copilot (PR #85): the last-reading preview is one plain-text
    // sentence via the shared preview helper, not a naive regex —
    // a heading line above the prose must not dump the whole
    // reading with raw markers into the tile. Behaviour is pinned
    // by the preview-line unit tests.
    expect(home).toContain('from "@/lib/preview-line"');
    expect(home).toContain("previewLine(latest.interpretation)");
  });

  it("designs the empty states: no thread, no streak, no journal yet", () => {
    const home = src("src/components/ReturningHome.tsx");
    expect(home).toContain("Your thread starts with your first reading.");
    expect(home).toContain("Nothing repeating yet — each reading adds to the pattern.");
    expect(home).toContain("Your journal: no readings saved yet");
    expect(home).toContain("Daily card streak: not started yet");
    // Day 2: one reading, a 1-day streak — a plain sentence, not
    // an empty box.
    expect(home).toContain("Daily card streak: 1 day");
    expect(home).toContain("Daily card streak: ${streak} days");
    expect(home).toContain('href="/journal"');
    expect(home).toContain("See all past readings");
  });

  it("keeps the existing card styles: no MagicBento", () => {
    const home = src("src/components/ReturningHome.tsx");
    expect(home).not.toContain("MagicBento");
    expect(
      existsSync(path.resolve(process.cwd(), "src/components/MagicBento.tsx"))
    ).toBe(false);
  });
});

describe("Three-card nudge after the first reading", () => {
  it("is a link to the 3-card spread, cost labelled, never free", () => {
    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    expect(sections).toContain("export function ThreeCardNudge()");
    const h2 = sections.match(
      /export function ThreeCardNudge\(\) \{[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/
    );
    expect(h2).not.toBeNull();
    expect((h2 as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "Go deeper with three cards"
    );
    const link = sections.match(
      /<Link[^>]*href="\/intake\/past-present-future"[^>]*>([\s\S]*?)<\/Link>/
    );
    expect(link).not.toBeNull();
    const label = (link as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(label).toContain("1 Oracle");
    expect(label).not.toContain("free");
    expect(label).toContain("Past · Present · Future");
  });

  it("renders after the save prompt, only on a free Quick Insight reading", () => {
    const client = src("src/app/reading/[id]/ReadingDetailClient.tsx");
    expect(client).toContain("ThreeCardNudge");
    expect(client).toContain(
      'reading.free && reading.spreadSlug === "quick-insight" && <ThreeCardNudge />'
    );
    // Save first, then the nudge: the plan's order.
    expect(client.indexOf("<GuestKeepNotice />")).toBeLessThan(
      client.indexOf("<ThreeCardNudge />")
    );
  });
});

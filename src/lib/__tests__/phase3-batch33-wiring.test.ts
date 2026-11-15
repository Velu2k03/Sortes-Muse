import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 3 Batch 3.3 reading detail order and grouping", () => {
  const client = src("src/app/reading/[id]/ReadingDetailClient.tsx");
  const sections = src("src/app/reading/[id]/ReadingSections.tsx");

  it("orders the reading before the actions", () => {
    // The guest save prompt and the three-card nudge no longer sit
    // above the cards and the interpretation.
    const body = client.slice(client.indexOf("return ("));
    const headerAt = body.indexOf("<ReadingHeader");
    const cardRowAt = body.indexOf("<CardRow");
    const interpAt = body.indexOf("<Interpretation");
    const glanceAt = body.indexOf("<AtAGlance");
    const meaningsAt = body.indexOf("<CardMeanings");
    const askMoreAt = body.indexOf('aria-label="Ask more"');
    const keepAt = body.indexOf('aria-label="Keep and share"');
    expect(headerAt).toBeGreaterThan(-1);
    expect(cardRowAt).toBeGreaterThan(headerAt);
    expect(interpAt).toBeGreaterThan(cardRowAt);
    expect(glanceAt).toBeGreaterThan(interpAt);
    expect(meaningsAt).toBeGreaterThan(glanceAt);
    expect(askMoreAt).toBeGreaterThan(meaningsAt);
    expect(keepAt).toBeGreaterThan(askMoreAt);
  });

  it("splits the mixed panel into Ask more and Keep and share", () => {
    const askMore = client.slice(
      client.indexOf('aria-label="Ask more"'),
      client.indexOf('aria-label="Keep and share"')
    );
    expect(askMore).toContain("<ThreeCardNudge");
    expect(askMore).toContain("<FollowUpThread");
    expect(askMore).toContain("<NewReadingPrompt");
    expect(askMore).toContain("Cast a birth chart for this question");
    const keep = client.slice(client.indexOf('aria-label="Keep and share"'));
    expect(keep).toContain("<GuestKeepNotice");
    expect(keep).toContain("<ShareReading");
    expect(keep).toContain("<ReadingHeirloom");
    // The old mixed panel is gone: no single div holds both
    // ShareReading and FollowUpThread.
    expect(client).not.toContain("Cast a birth chart for it");
  });

  it("marks the guest follow-up as opening sign-in, and names the not-found CTA", () => {
    expect(sections).toContain("Sign in to ask a follow-up…");
    expect(client).toContain("Choose a spread");
    expect(client).not.toContain("Begin a new reading");
  });
});

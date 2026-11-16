/**
 * UX audit Phase 2, F25 (journal).
 * The guest subhead was two paragraphs saying the same thing
 * (guest-only storage + sign in to sync). One paragraph now, with
 * the data-loss warning folded in.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F25 journal subhead is one paragraph", () => {
  it("the guest subhead carries the warning and the sync call in one paragraph", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    expect(journal).toContain(
      "Every full reading and saved chart interpretation you complete is kept here on this device. If you clear your browser data, they are gone. Sign in to sync your journal across devices."
    );
    expect(journal).not.toContain("Guest entries live only on this device");
    expect(journal).not.toContain("Sign in to keep them.");
  });

  it("the signed-in subhead still says the journal follows the account", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    expect(journal).toContain(
      "kept here and synced to your account, so your journal follows you across devices."
    );
  });
});

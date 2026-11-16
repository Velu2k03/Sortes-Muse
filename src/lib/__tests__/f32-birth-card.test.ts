/**
 * UX audit Phase 2, F32 (birth card).
 * A 60-word arithmetic lesson sat before the user picked a date.
 * The form needs one line; the method lives in a disclosure.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F32 birth card form is one line; the method is disclosed", () => {
  it("the form says one line; the method is in a disclosure", () => {
    const page = src("src/app/birth-card/page.tsx");
    expect(page).toContain("Pick your birth date. Your two cards appear below.");
    expect(page).toContain("<summary");
    expect(page).toContain("How it is calculated</summary>");
    expect(page).toContain("Add the digits of your birth date");
    expect(page).toContain("That is your Personality card.");
    expect(page).toContain("that is your Soul card.");
    expect(page).not.toContain("Pick a date\n          and your cards appear below, no button needed.");
  });
});

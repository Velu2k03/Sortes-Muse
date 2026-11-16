import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 3 Batch 3.4 daily card", () => {
  const daily = src("src/app/daily/page.tsx");
  const modal = src("src/components/CardModal.tsx");

  it("keeps the hold-to-draw ritual", () => {
    // Velu's decision (2026-11-16): the rituals stay. The HoldButton
    // and its StarBorder are not replaced by a plain button.
    expect(daily).toContain("HoldButton");
    expect(daily).toContain("StarBorder");
    expect(daily).toContain("<HoldButton");
  });

  it("focuses the revealed card on a same-day return", () => {
    // A returning user lands on the card. A fresh draw does not
    // focus (the user just held the button and it is animating).
    expect(daily).toContain("cardButtonRef");
    expect(daily).toContain("isReturnRef");
    expect(daily).toContain("cardButtonRef.current.focus()");
    expect(daily).toContain("ref={cardButtonRef}");
  });

  it("lifts the evening-return input to 16px and 44px", () => {
    const input = daily.match(
      /id="daily-reflection"[\s\S]*?className="([^"]*)"/
    );
    expect(input).not.toBeNull();
    const cls = (input as RegExpMatchArray)[1];
    expect(cls).toContain("text-base");
    expect(cls).toContain("py-3");
    expect(cls).not.toContain("text-sm");
    expect(cls).not.toContain("py-2");
  });

  it("takes the foil colour from the brand token, not the old gold", () => {
    expect(daily).toContain('foilColor="var(--color-gold)"');
    expect(daily).not.toContain('foilColor="#b9975b"');
    // The enlarged card in the modal is the same card, same fix.
    expect(modal).toContain('foilColor="var(--color-gold)"');
    expect(modal).not.toContain('foilColor="#b9975b"');
  });
});

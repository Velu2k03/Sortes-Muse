import { describe, it, expect } from "vitest";
import {
  CARDS,
  cardSlug,
  getCardBySlug,
  suitElement,
  DEFAULT_DECK_VIEW,
  resolveDeckView,
} from "@/lib/cards";
import sitemap from "@/app/sitemap";

// Phase 4A (4.4): every card has a deep-linkable /deck/[slug] route.
// The slug comes from the card name, so it must be unique across all
// 78 cards and must round-trip back to the same card.
describe("cardSlug / getCardBySlug", () => {
  it("slugifies names the way the route expects", () => {
    expect(cardSlug("The Fool")).toBe("the-fool");
    expect(cardSlug("Ace of Wands")).toBe("ace-of-wands");
    expect(cardSlug("Two of Cups")).toBe("two-of-cups");
    expect(cardSlug("Wheel of Fortune")).toBe("wheel-of-fortune");
    expect(cardSlug("The Hanged Man")).toBe("the-hanged-man");
  });

  it("gives all 78 cards a unique, non-empty slug", () => {
    expect(CARDS).toHaveLength(78);
    const slugs = CARDS.map((c) => cardSlug(c.name));
    expect(slugs.every((s) => s.length > 0)).toBe(true);
    expect(new Set(slugs).size).toBe(78);
  });

  it("resolves every slug back to the same card", () => {
    for (const card of CARDS) {
      expect(getCardBySlug(cardSlug(card.name))).toBe(card);
    }
  });

  it("returns undefined for an unknown slug", () => {
    expect(getCardBySlug("not-a-card")).toBeUndefined();
    expect(getCardBySlug("")).toBeUndefined();
  });
});

describe("suitElement", () => {
  it("maps each minor suit to its classical element", () => {
    expect(suitElement("wands")).toBe("Fire");
    expect(suitElement("cups")).toBe("Water");
    expect(suitElement("swords")).toBe("Air");
    expect(suitElement("pentacles")).toBe("Earth");
  });

  it("has no element for Major Arcana (null suit)", () => {
    expect(suitElement(null)).toBeUndefined();
  });
});

// Phase 4A (4.4): the card grid is the default view; the spiral is
// opt-in. Under prefers-reduced-motion the spiral is never shown.
describe("default deck view", () => {
  it("defaults to the grid", () => {
    expect(DEFAULT_DECK_VIEW).toBe("grid");
  });

  it("keeps an explicit spiral choice when motion is fine", () => {
    expect(resolveDeckView("spiral", false)).toBe("spiral");
    expect(resolveDeckView("grid", false)).toBe("grid");
  });

  it("forces the grid under reduced motion, even when spiral was asked for", () => {
    expect(resolveDeckView("spiral", true)).toBe("grid");
    expect(resolveDeckView("grid", true)).toBe("grid");
  });
});

// Phase 4A (4.4): all 78 card pages are in the sitemap.
describe("sitemap deck URLs", () => {
  it("lists /deck plus one URL per card, with no duplicates", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://sortes.resonantatlas.com/deck");
    const deckUrls = CARDS.map(
      (c) => `https://sortes.resonantatlas.com/deck/${cardSlug(c.name)}`,
    );
    for (const url of deckUrls) {
      expect(urls).toContain(url);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });
});

import { describe, it, expect } from "vitest";
import {
  CARDS,
  cardSlug,
  getCardBySlug,
  suitElement,
  DEFAULT_DECK_VIEW,
  resolveDeckView,
  resolveDeckFilter,
  filterDeckCards,
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

// Batch 5: the list is the default view; the grid and the spiral
// are opt-ins. Under prefers-reduced-motion the spiral is never
// shown; it falls back to the list. Grid and list are static, so an
// explicit choice of either is kept even under reduced motion.
describe("default deck view", () => {
  it("defaults to the list", () => {
    expect(DEFAULT_DECK_VIEW).toBe("list");
  });

  it("keeps an explicit choice when motion is fine", () => {
    expect(resolveDeckView("spiral", false)).toBe("spiral");
    expect(resolveDeckView("grid", false)).toBe("grid");
    expect(resolveDeckView("list", false)).toBe("list");
  });

  it("falls back to the list under reduced motion, only for the spiral", () => {
    expect(resolveDeckView("spiral", true)).toBe("list");
    expect(resolveDeckView("grid", true)).toBe("grid");
    expect(resolveDeckView("list", true)).toBe("list");
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

  it("does not list /journal because the page is noindex", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).not.toContain("https://sortes.resonantatlas.com/journal");
  });
});

describe("resolveDeckFilter / filterDeckCards", () => {
  it("passes valid filters through and defaults the rest to all", () => {
    for (const f of ["all", "major", "wands", "cups", "swords", "pentacles"]) {
      expect(resolveDeckFilter(f)).toBe(f);
    }
    expect(resolveDeckFilter("cups")).toBe("cups");
    expect(resolveDeckFilter(["swords", "cups"])).toBe("swords");
    expect(resolveDeckFilter(undefined)).toBe("all");
    expect(resolveDeckFilter("")).toBe("all");
    expect(resolveDeckFilter("bogus")).toBe("all");
    expect(resolveDeckFilter([])).toBe("all");
  });

  it("filters by arcana and suit", () => {
    expect(filterDeckCards("all", "")).toHaveLength(78);
    expect(filterDeckCards("major", "")).toHaveLength(22);
    for (const s of ["wands", "cups", "swords", "pentacles"] as const) {
      const list = filterDeckCards(s, "");
      expect(list).toHaveLength(14);
      expect(list.every((c) => c.suit === s)).toBe(true);
    }
  });

  it("matches names case-insensitively on the trimmed query and combines with filter", () => {
    expect(filterDeckCards("all", "  MOON ").map((c) => c.name)).toContain("The Moon");
    expect(filterDeckCards("cups", "ace").map((c) => c.name)).toEqual(["Ace of Cups"]);
    expect(filterDeckCards("major", "ace")).toHaveLength(0);
    expect(filterDeckCards("all", "   ")).toHaveLength(78);
  });
});

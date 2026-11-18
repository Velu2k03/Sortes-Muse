/**
 * Deck grid tile tilt (Velu 2026-11-19): each grid tile tilts
 * slightly toward a mouse pointer, max 7 degrees per axis,
 * perspective 900, spring stiffness 260 / damping 22 (TarotCard's
 * pattern at half the angle), and springs back flat on pointer
 * leave. Touch and pen are ignored. Reduced motion: no tilt at all.
 *
 * The tilt lives on its own wrapper (DeckTileTilt) between the
 * entrance motion.div and the Link, so the entrance (opacity/y)
 * and the tilt never fight over one transform, and the Link keeps
 * its CSS hover lift, border and shadow. The reduced-motion flag is
 * DeckClient's existing matchMedia state, passed down, so there is
 * still exactly one subscription in the file.
 *
 * Source-inspection tests, same convention as
 * reduced-motion-followups.test.ts. TarotCard and the spiral are
 * out of scope and must stay as they are.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

const deck = src("src/app/deck/DeckClient.tsx");

// Slice of the tilt wrapper, so assertions cannot match other
// motion code in the file.
function tiltComponent(): string {
  const start = deck.indexOf("function DeckTileTilt(");
  const end = deck.indexOf("export default function DeckClient(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return deck.slice(start, end);
}

// Slice of the grid view: from the grid container to its closing
// cards.map, so assertions about tile structure stay in the grid.
function gridBlock(): string {
  const start = deck.indexOf(
    '<div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6">',
  );
  const end = deck.indexOf("))}", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return deck.slice(start, end);
}

describe("deck grid tile tilt", () => {
  it("uses Motion values and TarotCard's spring, no new dependency", () => {
    expect(deck).toContain(
      'import { motion, useMotionValue, useSpring } from "motion/react";',
    );
    const tilt = tiltComponent();
    expect(tilt).toContain("useMotionValue(0)");
    expect(tilt.match(/useSpring\(tilt[XY], \{ stiffness: 260, damping: 22 \}\)/g) ?? []).toHaveLength(2);
    expect(tilt).toContain("transformPerspective: 900");
  });

  it("pointer move is guarded to mouse pointers only", () => {
    const tilt = tiltComponent();
    expect(tilt).toContain("onPointerMove=");
    expect(tilt).toContain('if (e.pointerType !== "mouse" || reducedMotion) return;');
    // Pointer events, not mouse events: the guard is what keeps
    // touch and pen from tilting.
    expect(tilt).not.toContain("onMouseMove");
  });

  it("max tilt is 7 degrees per axis", () => {
    expect(deck).toContain("const DECK_TILT_MAX_DEG = 7;");
    const tilt = tiltComponent();
    // (0..1 - 0.5) * 2 * 7 puts the tile edges at exactly ±7.
    expect(tilt).toContain(
      "tiltX.set(((e.clientX - r.left) / r.width - 0.5) * 2 * DECK_TILT_MAX_DEG);",
    );
    expect(tilt).toContain(
      "tiltY.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * DECK_TILT_MAX_DEG);",
    );
    // TarotCard's 14 is not copied in.
    expect(tilt).not.toMatch(/\* 14\b/);
  });

  it("pointer leave resets the tile to flat", () => {
    const tilt = tiltComponent();
    expect(tilt).toContain("onPointerLeave={handleLeave}");
    expect(tilt).toMatch(
      /const handleLeave = \(\) => \{\s*tiltX\.set\(0\);\s*tiltY\.set\(0\);\s*\};/,
    );
  });

  it("reduced motion disables the tilt entirely", () => {
    const tilt = tiltComponent();
    // No move handler, no rotate style.
    expect(tilt).toContain("onPointerMove={reducedMotion ? undefined : handleMove}");
    expect(tilt).toMatch(
      /reducedMotion\s*\?\s*undefined\s*:\s*\{ rotateX, rotateY, transformPerspective: 900 \}/,
    );
    // Switched on mid-session: snap flat without a spring.
    expect(tilt).toContain("rotateX.jump(0);");
    expect(tilt).toContain("rotateY.jump(0);");
    // The flag is DeckClient's existing state, passed down: still
    // exactly one matchMedia subscription in the file.
    expect(deck.match(/matchMedia\(/g) ?? []).toHaveLength(1);
    expect(gridBlock()).toContain("<DeckTileTilt reducedMotion={reducedMotion}>");
  });

  it("tilt wraps the Link, not the entrance motion.div", () => {
    const grid = gridBlock();
    const entrance = grid.indexOf("<motion.div");
    const tilt = grid.indexOf("<DeckTileTilt");
    const link = grid.indexOf("<Link");
    expect(entrance).toBeGreaterThan(-1);
    expect(tilt).toBeGreaterThan(entrance);
    expect(link).toBeGreaterThan(tilt);
    // Closing order mirrors it.
    const closeLink = grid.indexOf("</Link>");
    const closeTilt = grid.indexOf("</DeckTileTilt>");
    const closeEntrance = grid.lastIndexOf("</motion.div>");
    expect(closeTilt).toBeGreaterThan(closeLink);
    expect(closeEntrance).toBeGreaterThan(closeTilt);
    // The entrance tile carries no rotate of its own.
    const entranceTag = grid.slice(entrance, tilt);
    expect(entranceTag).not.toContain("rotateX");
    expect(entranceTag).not.toContain("onPointerMove");
  });

  it("Link href, hover lift, entrance and virtualization are unchanged", () => {
    const grid = gridBlock();
    expect(grid).toContain("href={`/deck/${cardSlug(c.name)}`}");
    expect(grid).toContain('aria-label={`View meaning of ${c.name}`}');
    expect(grid).toContain(
      'className="group block overflow-hidden rounded-xl border border-gold/20 bg-panel/50 transition hover:-translate-y-1 hover:border-gold/60 hover:shadow-gold-sm"',
    );
    expect(grid).toContain("initial={{ opacity: 0, y: 16 }}");
    expect(grid).toContain("animate={{ opacity: 1, y: 0 }}");
    expect(grid).toContain("transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.25 }}");
    expect(grid).toContain(
      'style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}',
    );
  });

  it("the raw wrapper carries a documented AGENTS.md exception", () => {
    expect(deck).toContain("AGENTS.md self-check exception");
    expect(deck).toContain("PR #152");
    expect(deck).toContain("PR #168");
  });

  it("TarotCard's own tilt is untouched", () => {
    const card = src("src/components/TarotCard.tsx");
    expect(card).toContain("tiltX.set(((e.clientX - r.left) / r.width - 0.5) * 14);");
    expect(card).toContain("rotateX, rotateY, transformPerspective: 900");
  });
});

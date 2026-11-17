import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// clsx for className ternaries (pick-ui-library gap, 2026-11-17):
// the curated pick for constructing className strings
// conditionally. The repeated `${className ? ` ${className}` : ''}`
// append boilerplate and the multi-condition ternaries now go
// through clsx instead. Same rendered classes, same behaviour,
// no visual change. Simple one-condition ternaries elsewhere
// (ChartSections, SpreadsClient, DeckClient, IntakeSteps,
// AccountClient, FaqList, ZiweiChartBoard, and the rest) are
// deliberately left alone: converting them adds noise for no win.
// Footer has no className ternaries at all.
//
// clsx follow-up (2026-11-17, all-pages fix): the unguarded
// `${className}` interpolations left out of scope above
// (FieldGroup, FoldText, HoldCard, InfiniteSpiral, ReactBits
// ClickSpark, ReactBitsNew SpotlightCard/GlareHover/Orb) now
// go through clsx too. Same rendered classes: every site
// defaults className to "" and clsx drops the empty value,
// so the token set is identical, only the trailing space
// the template left behind is gone. FoldText's `.trim()`
// on the template is gone with it.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

// Every file converted in this branch.
const CONVERTED = [
  "src/components/BranchedMenu.tsx",
  "src/components/CallChip.tsx",
  "src/components/GlideSelect.tsx",
  "src/components/Header.tsx",
  "src/components/HoldButton.tsx",
  "src/components/HoloCard.tsx",
  "src/components/LatticeLoader.tsx",
  "src/components/OptionWheel.tsx",
  "src/components/PageHeader.tsx",
  "src/components/PricingClient.tsx",
  "src/components/ReactBits.tsx",
  "src/components/RubberSegment.tsx",
  "src/components/SlideCommit.tsx",
  "src/components/SpecularButton.tsx",
  "src/components/SplitText.tsx",
  "src/components/StatusMark.tsx",
  "src/components/ThemedDatePicker.tsx",
  "src/components/ThoughtLine.tsx",
];

describe("clsx classnames (pick-ui-library gap)", () => {
  it("clsx is a dependency", () => {
    const pkg = JSON.parse(src("package.json"));
    expect(pkg.dependencies.clsx).toBeDefined();
  });

  it("every converted file imports clsx and calls it", () => {
    for (const rel of CONVERTED) {
      const c = src(rel);
      expect(c, rel).toMatch(/from ["']clsx["']/);
      expect(c, rel).toContain("clsx(");
    }
  });

  it("no guarded className append boilerplate remains site-wide", () => {
    // The pattern this branch removes: `${className ? ` ${className}` : ''}`
    // (and the titleClassName variant in PageHeader). Any re-introduction
    // should go through clsx instead.
    const all = CONVERTED.map(src).join("\n");
    expect(all).not.toContain("className ? ` ${className}`");
    expect(all).not.toContain("titleClassName ? ` ${titleClassName}`");
  });

  it("Header nav links share one clsx base instead of two duplicated strings", () => {
    const c = src("src/components/Header.tsx");
    expect(c).toContain(
      '"inline-flex min-h-11 items-center px-2 text-sm",',
    );
    expect(c).not.toContain(
      '"inline-flex min-h-11 items-center px-2 text-sm font-semibold text-goldbright"',
    );
    expect(c).not.toContain(
      '"inline-flex min-h-11 items-center px-2 text-sm text-cream/80 transition hover:text-goldbright"',
    );
  });

  it("PricingClient billing toggle goes through clsx at both buttons", () => {
    const c = src("src/components/PricingClient.tsx");
    // Sliding pill (2026-11-17): both buttons share one
    // transparent base, the gold pill behind the active one
    // owns the background now, so the buttons only swap text
    // colour. The base string appears once per button.
    expect(
      c.match(
        /"relative z-1 min-h-11 rounded-full bg-transparent px-5 py-2 text-sm font-semibold transition-colors duration-250",/g,
      )?.length,
    ).toBe(2);
    expect(c).toContain('billing === "monthly" ? "text-ink" : "text-cream"');
    expect(c).toContain('billing === "annual" ? "text-ink" : "text-cream"');
    expect(c).not.toContain('"border-gold bg-gold text-ink"');
  });

  it("ThemedDatePicker day states use the flat clsx object form, not a nested ternary", () => {
    const c = src("src/components/ThemedDatePicker.tsx");
    expect(c).toContain('"btn-gold font-bold": selected,');
    expect(c).toContain(
      '"border border-gold/70 font-bold text-goldbright": !selected && isToday,',
    );
    expect(c).toContain(
      '"text-cream hover:bg-gold/15": !selected && !isToday && c.inMonth,',
    );
    expect(c).toContain(
      '"text-mist hover:bg-gold/10": !selected && !isToday && !c.inMonth,',
    );
    // The old three-deep nested ternary is gone.
    expect(c).not.toContain("? \"btn-gold font-bold\"");
  });

  it("OptionWheel, SplitText and LatticeLoader keep every class token", () => {
    const ow = src("src/components/OptionWheel.tsx");
    expect(ow).toContain("isDragging ? 'cursor-grabbing' : 'cursor-grab'");
    expect(ow).toContain("side === 'right' ? 'right-[var(--ow-inset)] origin-right'");
    expect(ow).toContain("selectedIndex === index ? 'font-medium' : 'font-extralight'");
    const st = src("src/components/SplitText.tsx");
    expect(st).toContain("clip ? 'overflow-hidden' : 'overflow-visible'");
    expect(st).toContain("trigger === 'click' && 'cursor-pointer'");
    const ll = src("src/components/LatticeLoader.tsx");
    expect(ll).toContain("'[opacity:calc(var(--ll-idle)*0.47)]'");
    expect(ll).toContain("[opacity:var(--ll-idle)]");
  });

  it("SpecularButton and HoloCard pass their class constants through clsx", () => {
    expect(src("src/components/SpecularButton.tsx")).toContain(
      "clsx(BUTTON, SIZES[size] ?? SIZES.lg, className)",
    );
    expect(src("src/components/HoloCard.tsx")).toContain(
      'clsx("holo-card", className)',
    );
  });
});

// Unguarded `${className}` interpolations (clsx follow-up,
// 2026-11-17): the same pattern without the ternary guard.
const UNGUARDED = [
  "src/components/FieldGroup.tsx",
  "src/components/FoldText.tsx",
  "src/components/HoldCard.tsx",
  "src/components/InfiniteSpiral.tsx",
  "src/components/ReactBits.tsx",
  "src/components/ReactBitsNew.tsx",
];

describe("clsx unguarded className interpolations", () => {
  it("every unguarded site imports clsx and calls it", () => {
    for (const rel of UNGUARDED) {
      const c = src(rel);
      expect(c, rel).toMatch(/from ["']clsx["']/);
      expect(c, rel).toContain("clsx(");
    }
  });

  it("no unguarded ${className} interpolation remains site-wide", () => {
    // The pattern this follow-up removes: `... ${className}`
    // inside a className template literal with no guard. Any
    // re-introduction should go through clsx instead.
    const all = UNGUARDED.map(src).join("\n");
    expect(all).not.toContain("${className}");
  });

  it("each unguarded site keeps its exact base classes in clsx form", () => {
    expect(src("src/components/FieldGroup.tsx")).toContain(
      'clsx("m-0 min-w-0 border-0 p-0", className)',
    );
    expect(src("src/components/FoldText.tsx")).toContain(
      'clsx("inline-block whitespace-pre-wrap select-text leading-[0.95] tracking-[-0.04em]", className)',
    );
    expect(src("src/components/HoldCard.tsx")).toContain(
      'clsx("flex flex-col items-center", className)',
    );
    expect(src("src/components/InfiniteSpiral.tsx")).toContain(
      'clsx("relative isolate h-full min-h-80 w-full overflow-hidden", className)',
    );
    expect(src("src/components/ReactBits.tsx")).toContain(
      'clsx("click-spark", className)',
    );
    const rbn = src("src/components/ReactBitsNew.tsx");
    expect(rbn).toContain('clsx("relative overflow-hidden", className)');
    expect(rbn).toContain(
      'clsx("relative inline-block overflow-hidden", className)',
    );
    expect(rbn).toContain(
      'clsx("pointer-events-none absolute inset-0 overflow-hidden", className)',
    );
  });

  it("FoldText no longer trims a className template", () => {
    // clsx drops the empty value, so the `.trim()` that
    // cleaned up the template's trailing space is gone.
    expect(src("src/components/FoldText.tsx")).not.toContain(
      "${className}`.trim()",
    );
  });
});

/**
 * All-pages fix 5 (base-ui refactor, 2026-11-17): the pick-ui-library
 * audit named five hand-built primitives. Two swap to base-ui, three
 * do not, and this file locks which is which so a future pass does
 * not re-litigate it from a grep.
 *
 * Swapped: CardModal -> base-ui Dialog, GlideSelect -> base-ui
 * Select. Both keep their public contract (props, copy, palette,
 * sizes, 150-250ms transitions); the dialog entrance is now a
 * 250ms CSS transition instead of a ~400ms motion spring, and the
 * select loses its gliding pill and pointer-scrub gesture, which
 * base-ui Select does not model. See the component headers.
 *
 * Left hand-built, with reasons in each file's header comment:
 * BranchedMenu (no tree-view primitive in base-ui, the SVG branch
 * lines and gliding marker ARE the component), ThemedDatePicker
 * (base-ui has no calendar/date-picker primitive), OptionWheel
 * (no curved wheel-picker primitive in base-ui).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("all-pages fix 5: base-ui refactor", () => {
  it("installs base-ui for React 19", () => {
    const pkg = JSON.parse(src("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@base-ui-components/react"]).toMatch(
      /^[\^~]?1\.0\.0-rc\.0$/,
    );
  });

  it("CardModal is base-ui Dialog and keeps the panel contract", () => {
    const modal = src("src/components/CardModal.tsx");
    for (const part of [
      "Dialog.Root",
      "Dialog.Portal",
      "Dialog.Backdrop",
      "Dialog.Viewport",
      "Dialog.Popup",
      "Dialog.Title",
      "Dialog.Close",
    ]) {
      expect(modal).toContain(part);
    }
    // Panel classes the old shell carried, unchanged.
    expect(modal).toContain("max-h-[92vh]");
    expect(modal).toContain("overscroll-contain");
    const panel = modal.match(/className="[^"]*overflow-y-auto[^"]*"/);
    expect(panel).not.toBeNull();
    expect(panel![0]).toContain("overscroll-contain");
    // Card copy the F15/F19 tests lock, unchanged.
    expect(modal).toContain("Major Arcana, card ${card.number}");
    expect(modal).toContain("Minor Arcana, ${card.suit");
    expect(modal).toContain("Readings are for reflection, not predictions");
    // The hand-rolled shell is gone, not wrapped. (Asserted on
    // import/use lines, not on the word: the header comment above
    // names the old hook in prose.)
    expect(modal).not.toContain("@/components/useFocusTrap");
    expect(modal).not.toMatch(/import.*useFocusTrap/);
    expect(modal).not.toMatch(/<AnimatePresence/);
    expect(modal).not.toContain('from "motion/react"');
    // Entrance/exit are 250ms CSS transitions on base-ui's
    // starting/ending styles, inside the 150-250ms band.
    expect(modal).toContain("duration-250");
    expect(modal).toContain("data-[starting-style]");
    expect(modal).toContain("data-[ending-style]");
  });

  it("GlideSelect is base-ui Select and keeps its public API", () => {
    const select = src("src/components/GlideSelect.tsx");
    for (const part of [
      "Select.Root",
      "Select.Trigger",
      "Select.Value",
      "Select.Portal",
      "Select.Positioner",
      "Select.Popup",
      "Select.List",
      "Select.Item",
      "Select.ItemText",
      "Select.ItemIndicator",
    ]) {
      expect(select).toContain(part);
    }
    // Same props the ChartSections call sites pass.
    for (const prop of [
      "options?:",
      "value?:",
      "defaultValue?:",
      "onChange?:",
      "placeholder?:",
      "ariaLabel?:",
      "disabled?:",
    ]) {
      expect(select).toContain(prop);
    }
    // Token-backed colours at the call sites are unchanged (the
    // F17 test locks these on ChartSections, not here).
    expect(select).toContain("accentColor");
    expect(select).toContain("surfaceColor");
    expect(select).toContain("textColor");
    // The hand-rolled listbox machinery is gone, not wrapped.
    // (Asserted on handler/ref names, not on the word "scrub":
    // the header comment names the old gesture in prose.)
    expect(select).not.toContain("onListDown");
    expect(select).not.toContain("pillRef");
    expect(select).not.toContain("scrub.current");
    expect(select).not.toContain('role="listbox"');
    expect(select).not.toContain('role="option"');
    // Non-modal, like the old select: opening it does not lock
    // page scroll.
    expect(select).toContain("modal={false}");
  });

  it("GlideSelect carries its --gs-* theme vars across the portal", () => {
    // PR #148 blocker: Select.Portal mounts the popup under
    // document.body, outside the wrapper div, so vars set only on
    // the wrapper never reached the popup -- it rendered
    // transparent, ~108px wide instead of the 176px menuWidth,
    // with page text showing through. The fix is one shared
    // themeVars object set on BOTH the wrapper and Select.Popup.
    const select = src("src/components/GlideSelect.tsx");
    for (const v of [
      "'--gs-accent'",
      "'--gs-surface'",
      "'--gs-highlight'",
      "'--gs-text'",
      "'--gs-radius'",
      "'--gs-inner-radius'",
      "'--gs-chip'",
      "'--gs-row'",
      "'--gs-font'",
      "'--gs-menu-w'",
    ]) {
      expect(select).toContain(v);
    }
    expect(select).toContain("const themeVars");
    // The wrapper div and the portaled popup both get the object.
    expect(select).toMatch(/<div[\s\S]*?style=\{themeVars\}/);
    expect(select).toMatch(/<Select\.Popup[\s\S]*?style=\{themeVars\}/);
  });

  it("BranchedMenu stays hand-built: no tree-view primitive exists", () => {
    const menu = src("src/components/BranchedMenu.tsx");
    expect(menu).not.toContain("@base-ui-components/react");
    expect(menu).toContain("LEFT HAND-BUILT");
    expect(menu).toContain("no tree-view primitive");
  });

  it("ThemedDatePicker stays hand-built: no calendar primitive exists", () => {
    const picker = src("src/components/ThemedDatePicker.tsx");
    expect(picker).not.toContain("@base-ui-components/react");
    expect(picker).toContain("LEFT HAND-BUILT");
    expect(picker).toContain("no calendar");
  });

  it("OptionWheel stays hand-built: no wheel-picker primitive exists", () => {
    const wheel = src("src/components/OptionWheel.tsx");
    expect(wheel).not.toContain("@base-ui-components/react");
    expect(wheel).toContain("LEFT HAND-BUILT");
    expect(wheel).toContain("no curved wheel-picker primitive");
  });

  it("the deleted focus-trap hook has no remaining consumer", () => {
    // Asserted on the import line, not on the word: CardModal's
    // header comment names the old hook in prose.
    const grep = (rel: string) => src(rel);
    for (const f of [
      "src/components/CardModal.tsx",
      "src/components/GlideSelect.tsx",
      "src/components/BranchedMenu.tsx",
      "src/components/ThemedDatePicker.tsx",
      "src/components/OptionWheel.tsx",
    ]) {
      expect(grep(f)).not.toContain("@/components/useFocusTrap");
      expect(grep(f)).not.toMatch(/import.*useFocusTrap/);
    }
  });
});

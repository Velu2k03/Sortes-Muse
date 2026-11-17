import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// GlideSelect name= pass-through (PR #159 follow-up,
// 2026-11-18): base-ui Select renders a visually-hidden
// value-holder input (tabIndex -1, aria-hidden, 1px
// clipped) and puts Select.Root's `name` on it -- see
// node_modules/@base-ui-components/react/esm/select/root/
// SelectRoot.js, `name: multiple ? undefined : name` on
// the hidden input. /charts had 2 such inputs with no
// name in the live DOM (system picker, birthplace preset
// picker); the native <select> in the reduced-motion
// branch already had name="place", so no source edit
// could name the library inputs. The fix is an optional
// `name` prop on GlideSelect, passed to Select.Root, used
// at the two /charts call sites only: "system" (matches
// the state variable and the ?system= URL param) and
// "place" (matches the native select's name="place", so
// the submitted field name does not change with motion
// preference). No other GlideSelect call site exists, and
// no other call site is changed.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

// Every non-test source file under src/, following the
// Batch 6a walker (same as clsx-classnames.test.ts,
// z-index-tokens.test.ts, form-name-attributes.test.ts):
// recurse, skip __tests__ directories, skip *.test.ts /
// *.test.tsx files.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...sourceFiles(p));
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

// Extract the opening tag starting at `start` (the `<` of
// <GlideSelect or <Select.Root). Tags span lines and their
// attributes hold arrow functions, so a plain "to the next
// >" would stop inside `=>`: scan tracking brace depth
// and string state, and stop at the first `>` or `/>` at
// depth 0 outside a string. Line comments between
// attributes (// ...) are skipped too: a `>` inside one
// (e.g. "native <select>") must not end the tag early.
// Same scanner as form-name-attributes.test.ts, plus the
// line-comment skip.
function openTagAt(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/" && depth === 0) {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (ch === ">" && depth === 0) {
      return text.slice(start, i + 1);
    } else if (ch === "/" && text[i + 1] === ">" && depth === 0) {
      return text.slice(start, i + 2);
    }
  }
  return text.slice(start);
}

// All <GlideSelect ...> opening tags in non-test src/,
// with the file and the literal name= value each carries.
function glideSelectUsages(): { file: string; name: string | null }[] {
  const out: { file: string; name: string | null }[] = [];
  for (const file of sourceFiles(path.resolve(process.cwd(), "src"))) {
    const text = readFileSync(file, "utf8");
    const re = /<GlideSelect(?=[\s/>]|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const tag = openTagAt(text, m.index);
      const named = tag.match(/\bname="([^"]+)"/);
      out.push({
        file: path.relative(process.cwd(), file),
        name: named ? named[1] : null,
      });
    }
  }
  return out;
}

describe("GlideSelect passes name= to base-ui Select", () => {
  it("GlideSelect declares an optional name prop and passes it to Select.Root", () => {
    const select = src("src/components/GlideSelect.tsx");
    expect(select).toContain("name?: string;");
    const rootAt = select.indexOf("<Select.Root");
    expect(rootAt).toBeGreaterThan(-1);
    const rootTag = openTagAt(select, rootAt);
    expect(rootTag).toContain("name={name}");
  });

  it("the two /charts call sites pass system and place", () => {
    const usages = glideSelectUsages();
    // Exactly two call sites exist in src/, both in
    // ChartSections: the system picker and the birthplace
    // preset picker. If a third is added later, this test
    // fails until it is named too (see the site-wide test).
    expect(usages).toHaveLength(2);
    expect(usages.map((u) => u.name).sort()).toEqual([
      "place",
      "system",
    ]);
    for (const u of usages) {
      expect(u.file).toBe("src/app/charts/ChartSections.tsx");
    }
  });

  it("the birthplace name matches the native reduced-motion select", () => {
    // The native <select> in the reduced-motion branch has
    // name="place", so the submitted field name must not
    // change with motion preference.
    const charts = src("src/app/charts/ChartSections.tsx");
    expect(charts).toContain('name="place"');
    const usages = glideSelectUsages();
    expect(usages.map((u) => u.name)).toContain("place");
  });

  it("every GlideSelect usage site-wide carries a name=", () => {
    const unnamed = glideSelectUsages().filter((u) => u.name === null);
    expect(unnamed).toEqual([]);
  });
});

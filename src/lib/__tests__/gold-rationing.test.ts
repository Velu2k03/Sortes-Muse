import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// Gold rationing (Velu 2026-11-18, closes S-14 from the Griffin
// re-run audit): gold is for the H1 and the primary CTA only. Every
// H2 and H3 renders cream (text-cream, the token the site already
// used for its non-gold headings), never text-gold / text-goldbright.
// The audit found every H1, H2 and H3 gold; this branch moved 64 H2s
// and 17 H3s plus the ChartSections SplitText h2 to cream, and the
// print heirloom section heading (an h2) off dark gold to the print
// sheet's ink.
//
// Out of scope and deliberately not guarded here: the wordmark
// gradient, the scroll-progress bar, the hero video scrim, gold
// borders (the pricing Star panel), gold eyebrows, chips and links.
// The rule is about heading text colour.
//
// Same site-wide walker pattern as clsx-classnames.test.ts: every
// non-test .tsx file under src/app and src/components, skipping
// __tests__ directories and *.test.tsx files.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...tsxFiles(p));
    } else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) {
      out.push(p);
    }
  }
  return out;
}

const FILES = [
  ...tsxFiles(path.resolve(process.cwd(), "src/app")),
  ...tsxFiles(path.resolve(process.cwd(), "src/components")),
];

type Heading = { file: string; line: number; level: string; tag: string };

// Brace-aware scan for the end of a JSX opening tag, so an arrow
// function (`=>`) or a nested template inside a prop does not end
// the tag early.
function tagEnd(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

// Every literal <h1>/<h2>/<h3> opening tag, plus SplitText with a
// tag="hN" prop (SplitText renders that tag; a literal-tag grep
// misses it).
function headings(): Heading[] {
  const out: Heading[] = [];
  for (const file of FILES) {
    const s = readFileSync(file, "utf8");
    const open = /<(h[1-3]|SplitText)\b/g;
    let m: RegExpExecArray | null;
    while ((m = open.exec(s))) {
      const end = tagEnd(s, m.index + 1);
      if (end < 0) continue;
      const tag = s.slice(m.index, end + 1);
      let level: string | undefined = m[1];
      if (level === "SplitText") level = (tag.match(/\btag="(h[1-6])"/) || [])[1];
      if (!level || !/^h[1-3]$/.test(level)) continue;
      out.push({
        file: path.relative(process.cwd(), file),
        line: s.slice(0, m.index).split("\n").length,
        level,
        tag,
      });
    }
  }
  return out;
}

const ALL = headings();
const where = (h: Heading) => `${h.file}:${h.line} ${h.level}`;

describe("gold rationing: H2 and H3 are cream, never gold", () => {
  it("the walker finds the site's headings (guards against a silent empty scan)", () => {
    expect(ALL.filter((h) => h.level === "h1").length).toBeGreaterThanOrEqual(20);
    expect(ALL.filter((h) => h.level !== "h1").length).toBeGreaterThanOrEqual(80);
  });

  it("no H2 or H3 anywhere carries a gold class", () => {
    const gold = ALL.filter((h) => h.level !== "h1" && /gold/.test(h.tag)).map(where);
    expect(gold).toEqual([]);
  });

  it("every coloured H2 and H3 uses the existing cream token", () => {
    // Headings with a class but no colour class (print sheets) are
    // covered by the globals.css test below.
    const coloured = ALL.filter((h) => h.level !== "h1" && /\btext-(cream|mist|ink)\b/.test(h.tag));
    expect(coloured.length).toBeGreaterThanOrEqual(80);
    const notCream = coloured.filter((h) => !/\btext-cream\b/.test(h.tag)).map(where);
    expect(notCream).toEqual([]);
  });

  it("the ChartSections SplitText h2 and ReadingText h3 are cream", () => {
    const chart = src("src/app/charts/ChartSections.tsx");
    expect(chart).toMatch(/tag="h2"\s+text=\{[^}]*\}\s+className="font-display text-3xl text-cream"/);
    expect(src("src/components/ReadingText.tsx")).toMatch(/<h3 key=\{i\} className="[^"]*\btext-cream\b[^"]*"/);
  });

  it("globals.css sets no gold colour on H2/H3 rules or the print section heading", () => {
    const css = src("src/app/globals.css");
    const GOLD = /#7c5e00|#d4af37|#f4d03f|--color-gold/i;
    const heading = css.match(/\.heirloom-heading\s*\{[^}]*\}/);
    expect(heading).not.toBeNull();
    expect(heading![0]).not.toMatch(GOLD);
    // Any rule whose selector names h2 or h3 must not colour it gold.
    const rules = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
    const goldHeadingRules = rules.filter((r) => {
      const [selector, body] = r.split("{");
      return /(^|[\s,>+~])h[23]\b/.test(selector.replace(/\/\*[\s\S]*?\*\//g, "")) && GOLD.test(body);
    });
    expect(goldHeadingRules).toEqual([]);
  });
});

describe("gold rationing: H1 stays gold", () => {
  it("every on-screen H1 is text-goldbright", () => {
    // The two print-only sheets (heirloom-title, ink on paper) are
    // the only H1s without a screen colour class.
    const screen = ALL.filter((h) => h.level === "h1" && !/heirloom-title/.test(h.tag));
    const notGold = screen.filter((h) => !/\btext-goldbright\b/.test(h.tag)).map(where);
    expect(notGold).toEqual([]);
  });

  it("the shared PageHeader H1 stays gold", () => {
    expect(src("src/components/PageHeader.tsx")).toMatch(/<h1 className=\{clsx\("[^"]*\btext-goldbright\b/);
  });
});

describe("gold rationing: primary CTAs stay gold", () => {
  it(".btn-gold keeps its gold gradient", () => {
    const css = src("src/app/globals.css");
    const rule = css.match(/\.btn-gold\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/linear-gradient\([^)]*#d4af37/);
  });

  it("the homepage hero CTA and the returning-home CTA use btn-gold", () => {
    expect(src("src/app/page.tsx")).toMatch(/className="btn-gold\b/);
    expect(src("src/components/ReturningHome.tsx")).toMatch(/className="btn-gold\b/);
  });

  it("btn-gold is still the site-wide primary CTA class", () => {
    const users = FILES.filter((f) => /\bbtn-gold\b/.test(readFileSync(f, "utf8")));
    expect(users.length).toBeGreaterThanOrEqual(20);
  });

  it("the pricing Star tier keeps the primary button variant", () => {
    expect(src("src/components/PricingClient.tsx")).toMatch(/variant=\{tier\.id === "star" \? "primary" : "secondary"\}/);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// Form controls need name= (Vercel Web Interface Guidelines,
// Griffin + Vercel re-run audit 2026-11-18): only the two
// hidden inputs in the unsubscribe HTML string had one, and
// the audit's "1 form control" was a CallChip prop, not a
// form control at all. This branch adds a meaningful name=
// to every native <input>, <textarea>, and <select> in src/:
// 41 inputs, 7 textareas, 9 selects (the audit undercounted
// selects at 5). Dynamic fields use a dynamic name that
// matches their id: intake fields use name={field.key},
// Reports BirthFields use name={`${prefix}-...`}, the
// birth-profile fields use name={`birth-profile-...`}, and
// the typed date picker uses name={`${id}-typed`}. Adding
// name= changes nothing else: every control here is a
// controlled component wired by value/onChange, so name=
// is inert for behaviour and only helps autofill, form
// submission, and accessibility tooling.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

// Every non-test source file under src/, following the
// Batch 6a walker (same as clsx-classnames.test.ts and
// z-index-tokens.test.ts): recurse, skip __tests__
// directories, skip *.test.ts / *.test.tsx files.
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
// <input, <textarea, or <select). Tags span lines and their
// attributes hold arrow functions, so a plain "to the next
// >" would stop inside `=>`: scan tracking brace depth
// and string state, and stop at the first `>` or `/>` at
// depth 0 outside a string.
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

function controlsWithoutName(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const offenders: string[] = [];
  const re = /<(input|textarea|select)(?=[\s/>]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tag = openTagAt(text, m.index);
    if (!/\bname\s*=/.test(tag)) {
      const line = text.slice(0, m.index).split("\n").length;
      offenders.push(`${path.relative(process.cwd(), file)}:${line} <${m[1]}>`);
    }
  }
  return offenders;
}

describe("form controls carry name=", () => {
  it("hero question input is named question", () => {
    const c = src("src/app/page.tsx");
    expect(c).toContain('name="question"');
    expect(c).toContain('id="hero-question"');
  });

  it("account sign-in inputs are named email, password, and code", () => {
    const c = src("src/app/account/AccountClient.tsx");
    expect(c).toContain('name="email"');
    expect(c).toContain('name="password"');
    expect(c).toContain('name="code"');
  });

  it("intake fields use their field key as the name", () => {
    const c = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(c).toContain("name={field.key}");
    expect(c).toContain('name="story"');
    expect(c).toContain('name="impression"');
  });

  it("reports birth fields use the prefixed name, matching their id", () => {
    const c = src("src/app/reports/ReportsClient.tsx");
    expect(c).toContain("name={`${prefix}-date`}");
    expect(c).toContain("name={`${prefix}-gender`}");
    expect(c).toContain('name="target-date"');
    expect(c).toContain('name="year"');
  });

  it("reading follow-up input is named and its placeholder uses a real ellipsis", () => {
    const c = src("src/app/reading/[id]/ReadingSections.tsx");
    expect(c).toContain('name="follow-up-question"');
    expect(c).toContain(
      'placeholder="Ask a follow-up about this reading…"',
    );
    expect(c).not.toContain("Ask a follow-up about this reading...");
  });

  it("no native input, textarea, or select lacks name= site-wide", () => {
    const offenders = sourceFiles(path.resolve(process.cwd(), "src")).flatMap(
      controlsWithoutName,
    );
    expect(offenders).toEqual([]);
  });
});

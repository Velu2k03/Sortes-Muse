// Audit items 6 and D2: readings arrive as light markdown (blank-line
// paragraphs, "# Heading" or a lone "**Heading**" line, inline **bold** and
// *italic*, "- item" / "1. item" lists, and "---" rules). No markdown library
// is installed, and this is the whole subset the model emits, so parse just
// that into words with bold/italic flags. Raw markers never reach the screen.

export interface ReadingWord {
  text: string;
  bold: boolean;
  italic: boolean;
}
export interface ReadingBlock {
  heading: boolean;
  /** Set on a list item; consecutive items with the same value form one list. */
  list?: "ul" | "ol";
  /** A horizontal rule (no words). */
  rule?: boolean;
  words: ReadingWord[];
}

function wordsOf(line: string, forceBold: boolean): ReadingWord[] {
  const out: ReadingWord[] = [];
  // Odd-indexed pieces of a split on ** are bold, odd-indexed pieces of a
  // further split on * are italic. An unmatched trailing marker just styles
  // the rest; the marker itself is dropped.
  line.split("**").forEach((piece, i) => {
    piece.split("*").forEach((part, j) => {
      for (const w of part.split(/\s+/)) {
        if (w) out.push({ text: w, bold: forceBold || i % 2 === 1, italic: j % 2 === 1 });
      }
    });
  });
  return out;
}

const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const UL = /^[-*]\s+(.*)$/;
const OL = /^\d+[.)]\s+(.*)$/;

export function parseReading(text: string): ReadingBlock[] {
  const blocks: ReadingBlock[] = [];
  for (const raw of text.split(/\n\s*\n/)) {
    const para = raw.trim();
    if (!para) continue;
    let prose: string[] = [];
    const flush = () => {
      const body = prose.join(" ").trim();
      if (body) blocks.push({ heading: false, words: wordsOf(body, false) });
      prose = [];
    };
    para.split("\n").forEach((line, idx) => {
      const t = line.trim();
      if (!t) return;
      // A heading line may sit directly above its paragraph with one newline.
      const hashed = idx === 0 ? /^#{1,6}\s+(.*)$/.exec(t) : null;
      const boldOnly = idx === 0 ? /^\*\*([^*]+)\*\*:?$/.exec(t) : null;
      const ul = UL.exec(t);
      const ol = OL.exec(t);
      if (RULE.test(t)) {
        flush();
        blocks.push({ heading: false, rule: true, words: [] });
      } else if (hashed || boldOnly) {
        flush();
        blocks.push({ heading: true, words: wordsOf((hashed ?? boldOnly)![1], false) });
      } else if (ul || ol) {
        flush();
        blocks.push({ heading: false, list: ul ? "ul" : "ol", words: wordsOf((ul ?? ol)![1], false) });
      } else {
        prose.push(t);
      }
    });
    flush();
  }
  return blocks;
}

/** Plain-text form for print/export: same parse, no markers. */
export function readingToPlainText(text: string): string {
  const out: string[] = [];
  let n = 0;
  let prev: ReadingBlock | undefined;
  for (const b of parseReading(text)) {
    const sameList = prev?.list && prev.list === b.list;
    n = b.list === "ol" ? (sameList ? n + 1 : 1) : 0;
    const line = b.words.map((w) => w.text).join(" ");
    const item = b.list === "ul" ? `• ${line}` : b.list === "ol" ? `${n}. ${line}` : line;
    if (b.rule) out.push("");
    else if (sameList) out[out.length - 1] += `\n${item}`;
    else out.push(item);
    prev = b;
  }
  return out.filter((s, i) => s !== "" || out[i - 1] !== "").join("\n\n").trim();
}

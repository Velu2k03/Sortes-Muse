// Audit item 6: readings arrive as light markdown (blank-line paragraphs,
// "# Heading" or a lone "**Heading**" line, inline **bold**). No markdown
// library is installed, and this is the whole subset the model emits, so
// parse just that into words with a bold flag. Raw "**" and "#" never reach
// the screen.

export interface ReadingWord {
  text: string;
  bold: boolean;
}
export interface ReadingBlock {
  heading: boolean;
  words: ReadingWord[];
}

function wordsOf(line: string, forceBold: boolean): ReadingWord[] {
  const out: ReadingWord[] = [];
  // Odd-indexed pieces of a split on ** are the bold ones. An unmatched
  // trailing ** just makes the rest bold; the marker itself is dropped.
  line.split("**").forEach((piece, i) => {
    for (const w of piece.split(/\s+/)) {
      if (w) out.push({ text: w, bold: forceBold || i % 2 === 1 });
    }
  });
  return out;
}

export function parseReading(text: string): ReadingBlock[] {
  const blocks: ReadingBlock[] = [];
  for (const raw of text.split(/\n\s*\n/)) {
    const para = raw.trim();
    if (!para) continue;
    // A heading line may sit directly above its paragraph with one newline.
    const [first, ...rest] = para.split("\n");
    const hashed = /^#{1,6}\s+(.*)$/.exec(first.trim());
    const boldOnly = /^\*\*([^*]+)\*\*:?$/.exec(first.trim());
    if (hashed || boldOnly) {
      blocks.push({ heading: true, words: wordsOf((hashed ?? boldOnly)![1], false) });
      const body = rest.join(" ").trim();
      if (body) blocks.push({ heading: false, words: wordsOf(body, false) });
    } else {
      blocks.push({ heading: false, words: wordsOf(para.replace(/\n/g, " "), false) });
    }
  }
  return blocks;
}

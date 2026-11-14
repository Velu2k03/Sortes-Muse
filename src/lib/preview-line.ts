// Remodel Phase 1 batch 3 (Velu, 2026-11-14): one plain-text
// sentence for the "Last reading" tile on the returning home.
// Saved interpretations are light markdown; a heading line above the
// prose breaks a naive first-sentence regex (it cannot match across
// the newline), which falls back to the whole reading with raw
// markers (Copilot, PR #85). Use the shared parser instead.
import { parseReading } from "@/lib/readingMarkdown";

export function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : text;
}

export function previewLine(text: string): string {
  const blocks = parseReading(text);
  // First non-heading prose block; if the reading has no prose
  // (list-only or heading-only), the first non-heading block of
  // any kind — never raw text, never a heading, never a marker.
  const block =
    blocks.find((b) => !b.heading && !b.rule && !b.list) ??
    blocks.find((b) => !b.heading && !b.rule);
  if (!block) return "";
  const plain = block.words
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const first = firstSentence(plain);
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
}

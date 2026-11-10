import type { ReactNode } from "react";
import { parseReading, type ReadingBlock } from "@/lib/readingMarkdown";

/**
 * Renders parsed reading blocks as h3 / p / ul / ol / hr. ReadingText
 * renders them in full, at once, with no limit. Batch 2a removed the
 * word-by-word reveal: saved readings replayed it on every open
 * (~18s for 600 words), and it cut mid-sentence.
 */
export function renderReadingBlocks(blocks: ReadingBlock[], limit = Infinity): ReactNode[] {
  let left = limit;
  const out: ReactNode[] = [];
  let group: { type: "ul" | "ol"; items: ReactNode[]; key: number } | null = null;
  const closeGroup = () => {
    if (!group) return;
    const Tag = group.type;
    out.push(
      <Tag
        key={`l${group.key}`}
        className={`mt-3 space-y-1 pl-5 first:mt-0 ${group.type === "ul" ? "list-disc" : "list-decimal"}`}
      >
        {group.items}
      </Tag>,
    );
    group = null;
  };
  for (let i = 0; i < blocks.length && left > 0; i++) {
    const b = blocks[i];
    if (b.rule) {
      closeGroup();
      out.push(<hr key={i} className="my-4 border-gold/25" />);
      continue;
    }
    const words = b.words.slice(0, left);
    left -= words.length;
    const inner = words.map((w, j) => (
      <span
        key={j}
        className={[w.bold && "font-semibold text-cream", w.italic && "italic"].filter(Boolean).join(" ") || undefined}
      >
        {j > 0 ? " " : ""}
        {w.text}
      </span>
    ));
    if (b.list) {
      if (group && group.type !== b.list) closeGroup();
      group ??= { type: b.list, items: [], key: i };
      group.items.push(<li key={i}>{inner}</li>);
      continue;
    }
    closeGroup();
    out.push(
      b.heading ? (
        <h3 key={i} className="mt-5 font-display text-lg text-goldbright first:mt-0">
          {inner}
        </h3>
      ) : (
        <p key={i} className="mt-3 first:mt-0">
          {inner}
        </p>
      ),
    );
  }
  closeGroup();
  return out;
}

/** Static (already generated) AI output: parsed, no animation. */
export default function ReadingText({ text, className }: { text: string; className?: string }) {
  return <div className={className}>{renderReadingBlocks(parseReading(text))}</div>;
}

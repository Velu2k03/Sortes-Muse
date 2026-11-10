"use client";

import { useEffect, useMemo, useState } from "react";
import { parseReading } from "@/lib/readingMarkdown";
import { renderReadingBlocks } from "@/components/ReadingText";

interface Props {
  text: string;
  /** Words revealed per tick. */
  speed?: number;
  className?: string;
}

/**
 * Reveals long text word by word, like the reading is being written for you
 * in the moment. A real "Show full reading" button skips to the full text. Respects reduced motion.
 */
export default function TypewriterText({ text, speed = 3, className }: Props) {
  const blocks = useMemo(() => parseReading(text), [text]);
  const total = useMemo(() => blocks.reduce((n, b) => n + b.words.length, 0), [blocks]);
  const [count, setCount] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const done = skipped || count >= total;

  useEffect(() => {
    // Deferred reset: a new text restarts the reveal on the next tick,
    // not synchronously inside the effect.
    queueMicrotask(() => {
      setCount(0);
      setSkipped(false);
    });
  }, [text]);

  useEffect(() => {
    if (done) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      queueMicrotask(() => setSkipped(true));
      return;
    }
    const t = setTimeout(() => {
      setCount((c) => Math.min(c + speed, total));
    }, 90);
    return () => clearTimeout(t);
  }, [count, done, speed, total]);

  // The revealed blocks are plain h3/p/ul/ol content, so assistive tech still
  // sees headings and lists. Skipping is a separate native button.
  if (done) {
    return <div className={className}>{renderReadingBlocks(blocks, total)}</div>;
  }

  return (
    <div className={className}>
      {renderReadingBlocks(blocks, count)}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-gold"
      />
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold text-goldbright"
        >
          Show full reading
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { parseReading, type ReadingBlock } from "@/lib/readingMarkdown";

interface Props {
  text: string;
  /** Words revealed per tick. */
  speed?: number;
  className?: string;
}

function renderBlocks(blocks: ReadingBlock[], limit: number) {
  let left = limit;
  const out = [];
  for (let i = 0; i < blocks.length && left > 0; i++) {
    const words = blocks[i].words.slice(0, left);
    left -= words.length;
    const inner = words.map((w, j) => (
      <span key={j} className={w.bold ? "font-semibold text-cream" : undefined}>
        {j > 0 ? " " : ""}
        {w.text}
      </span>
    ));
    out.push(
      blocks[i].heading ? (
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
  return out;
}

/**
 * Reveals long text word by word, like the reading is being written for you
 * in the moment. Click to skip to the full text. Respects reduced motion.
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

  if (done) {
    return <div className={className}>{renderBlocks(blocks, total)}</div>;
  }

  return (
    // div role=button: the reveal holds headings and paragraphs, which a
    // <button> may not contain.
    <div
      role="button"
      tabIndex={0}
      className={`block w-full cursor-pointer text-left ${className ?? ""}`}
      onClick={() => setSkipped(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setSkipped(true);
        }
      }}
      aria-label="Tap to reveal the full reading"
      title="Tap to reveal all"
    >
      {renderBlocks(blocks, count)}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-gold"
      />
    </div>
  );
}

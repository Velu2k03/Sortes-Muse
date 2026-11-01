"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  text: string;
  /** Words revealed per tick. */
  speed?: number;
  className?: string;
}

/**
 * Reveals long text word by word, like the reading is being written for you
 * in the moment. Click to skip to the full text. Respects reduced motion.
 */
export default function TypewriterText({ text, speed = 3, className }: Props) {
  const words = useMemo(() => text.split(/\s+/), [text]);
  const [count, setCount] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const done = skipped || count >= words.length;

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
      setCount((c) => Math.min(c + speed, words.length));
    }, 90);
    return () => clearTimeout(t);
  }, [count, done, speed, words.length]);

  if (done) {
    return <div className={className}>{words.join(" ")}</div>;
  }

  return (
    <button
      type="button"
      className={`block w-full text-left ${className ?? ""}`}
      onClick={() => setSkipped(true)}
      aria-label="Tap to reveal the full reading"
      title="Tap to reveal all"
    >
      {words.slice(0, count).join(" ")}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-gold"
      />
    </button>
  );
}

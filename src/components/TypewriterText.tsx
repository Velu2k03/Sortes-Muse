"use client";

import { useEffect, useRef, useState } from "react";

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
  const words = useRef<string[]>(text.split(/\s+/));
  const [count, setCount] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const done = skipped || count >= words.current.length;

  useEffect(() => {
    words.current = text.split(/\s+/);
    setCount(0);
    setSkipped(false);
  }, [text]);

  useEffect(() => {
    if (done) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setSkipped(true);
      return;
    }
    const t = setTimeout(() => {
      setCount((c) => Math.min(c + speed, words.current.length));
    }, 90);
    return () => clearTimeout(t);
  }, [count, done, speed]);

  return (
    <div
      className={className}
      onClick={() => setSkipped(true)}
      role={done ? undefined : "button"}
      aria-label={done ? undefined : "Tap to reveal the full reading"}
      title={done ? undefined : "Tap to reveal all"}
    >
      {words.current.slice(0, done ? undefined : count).join(" ")}
      {!done && (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-gold"
        />
      )}
    </div>
  );
}

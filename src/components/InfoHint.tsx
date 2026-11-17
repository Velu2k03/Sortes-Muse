"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Phase 7 (7.2): an info icon that reveals a short explanation one tap
 * away. A real button (not a div) with an aria-label naming the topic
 * and aria-expanded. It opens on tap, click, and keyboard (Enter or
 * Space, the button's native behaviour). It closes on Escape and on a
 * tap outside. Minimum tap target 44px. Only one InfoHint is open at
 * a time per page region, because opening one does not open another.
 *
 * Short text (one or two lines) goes in the popover. Longer text
 * should use a native details disclosure instead, per the 7.1
 * research (the oracles payment methods use this button because the
 * panel is wide enough for the two sentences).
 */
export default function InfoHint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 text-base font-bold text-goldbright"
      >
        i
      </button>
      {open ? (
        <span className="absolute left-0 z-20 mt-2 block w-72 max-w-[80vw] rounded-xl border border-gold/25 bg-panel p-3 text-left text-sm leading-relaxed text-cream/85 shadow-xl">
          {children}
        </span>
      ) : null}
    </span>
  );
}

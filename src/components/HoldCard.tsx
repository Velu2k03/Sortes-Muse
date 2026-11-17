'use client';

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import Image from "next/image";
import { CARD_BACK } from "@/lib/tarot";

interface HoldCardProps {
  /** Milliseconds the card must be held before the draw fires. Default 1200. */
  holdTime?: number;
  /** Fires once, when the hold completes. A tap never fires it. */
  onHold: () => void;
  className?: string;
}

/**
 * Daily card hold-to-draw (Velu, 2026-11-16 push-gate decision):
 * the face-down card itself is the hold target, not a separate
 * button. There is no tap alternative: a short press does nothing,
 * a full hold draws the card. A visible progress bar under the card
 * fills during the hold, so the control teaches itself.
 *
 * Input mirrors HoldButton: pointer hold with capture and drift
 * cancel, keyboard hold via Enter/Space, Escape cancels, and a
 * blur or hidden tab cancels. The bar is a state indicator, not
 * decorative motion: its width is set per frame with no CSS
 * transition, and the card-back sheen is already gated by
 * prefers-reduced-motion in globals.css. The reveal flip after the
 * draw is static under reduced motion (daily page).
 */
const HIT_PAD = 10;

export default function HoldCard({ holdTime = 1200, onHold, className = "" }: HoldCardProps) {
  const [progress, setProgress] = useState(0);
  const holdingRef = useRef(false);
  const inputRef = useRef<"pointer" | "key" | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef({ pointerId: null as number | null, start: 0, rect: null as DOMRect | null });
  const raf = useRef(0);
  const onHoldRef = useRef(onHold);
  const hintId = useId();

  useEffect(() => {
    onHoldRef.current = onHold;
  }, [onHold]);

  const cancelRaf = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  const finish = () => {
    // Guard, same as HoldButton: the hold must have run its full
    // time, not just reached full travel on a fast frame.
    if (performance.now() - gesture.current.start < holdTime - 50) return;
    holdingRef.current = false;
    inputRef.current = null;
    setProgress(1);
    onHoldRef.current();
  };

  const drive = (start: number) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / holdTime);
      setProgress(t);
      if (t >= 1) {
        raf.current = 0;
        finish();
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const begin = (kind: "pointer" | "key") => {
    if (holdingRef.current) return false;
    holdingRef.current = true;
    inputRef.current = kind;
    gesture.current.start = performance.now();
    gesture.current.rect = buttonRef.current?.getBoundingClientRect() ?? null;
    drive(gesture.current.start);
    return true;
  };

  const release = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    inputRef.current = null;
    cancelRaf();
    setProgress(0);
    // A tap never draws: only a completed hold fires onHold.
  };
  const releaseRef = useRef(release);
  useEffect(() => {
    releaseRef.current = release;
  });

  useEffect(() => {
    if (progress <= 0 || progress >= 1) return undefined;
    const cancel = () => releaseRef.current();
    const onVisibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [progress]);

  useEffect(
    () => () => {
      cancelRaf();
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !e.isPrimary || gesture.current.pointerId !== null) return;
    if (!begin("pointer")) return;
    gesture.current.pointerId = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const endPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== gesture.current.pointerId) return;
    gesture.current.pointerId = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    release();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== gesture.current.pointerId) return;
    const r = gesture.current.rect;
    if (!r) return;
    const out =
      e.clientX < r.left - HIT_PAD ||
      e.clientX > r.right + HIT_PAD ||
      e.clientY < r.top - HIT_PAD ||
      e.clientY > r.bottom + HIT_PAD;
    if (out) endPointer(e);
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "touch") endPointer(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      if (inputRef.current === "key") release();
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) begin("key");
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (inputRef.current === "key") release();
    }
  };

  const seconds = Math.round(holdTime / 100) / 10;
  const percent = Math.round(progress * 100);

  return (
    <div className={clsx("flex flex-col items-center", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Hold to draw today's card"
        aria-describedby={hintId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endPointer(e)}
        onPointerCancel={(e) => endPointer(e)}
        onLostPointerCapture={(e) => endPointer(e)}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onContextMenu={(e) => e.preventDefault()}
        className="relative block h-72 w-44 cursor-pointer touch-manipulation select-none rounded-xl [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy sm:h-[22rem] sm:w-56"
      >
        {/* Face-down card, the same back TarotCard shows (card-back
            sheen class, same border and shadow). The card itself is
            the hold target, so it is a button, not a nested control. */}
        <span
          className="card-back-sheen absolute inset-0 block overflow-hidden rounded-xl border border-gold/40 shadow-card-lg"
          aria-hidden="true"
        >
          <Image
            src={CARD_BACK}
            alt=""
            fill
            sizes="(max-width: 640px) 128px, 160px"
            className="object-cover"
            draggable={false}
          />
        </span>
        <span id={hintId} className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]">
          Press and hold for {seconds} seconds to draw today&apos;s card
        </span>
      </button>
      {/* Visible progress bar: a native <progress> element, so no
          ARIA role is needed. It fills gold while the card is held. */}
      <progress
        max={100}
        value={percent}
        aria-label="Draw progress"
        className="daily-progress mt-4 block h-2 w-44 appearance-none overflow-hidden rounded-full bg-gold/20 sm:w-56"
      />
      <span className="mt-3 block text-sm text-cream/75">Hold the card to draw today&apos;s card</span>
    </div>
  );
}

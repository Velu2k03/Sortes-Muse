"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { getCard, orientationKeywords } from "@/lib/cards";
import { CARD_BACK } from "@/lib/tarot";
import CardBurst from "@/components/CardBurst";

interface Props {
  cardId: string | null; // null = not dealt yet
  reversed?: boolean;
  revealed?: boolean;
  onFlip?: () => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  disabled?: boolean;
  /** Show the golden reveal burst (parent clears it after the animation). */
  celebrate?: boolean;
}

const SIZES = {
  sm: "w-20 h-32 sm:w-24 sm:h-40",
  md: "w-32 h-52 sm:w-40 sm:h-64",
  lg: "w-44 h-72 sm:w-56 sm:h-[22rem]",
};

/**
 * A tarot card with a smooth 3D flip, mouse-follow tilt on interactive
 * cards, a slow sheen sweeping the card back, and a golden glow that
 * blooms behind the card the moment it is revealed.
 */
export default function TarotCard({
  cardId,
  reversed = false,
  revealed = false,
  onFlip,
  size = "md",
  label,
  disabled = false,
  celebrate = false,
}: Props) {
  const card = cardId ? getCard(cardId) : null;
  const interactive = Boolean(onFlip) && !disabled && Boolean(cardId);
  const frameRef = useRef<HTMLDivElement>(null);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Mouse-follow tilt (desktop pointers only, skipped for reduced motion).
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltY, { stiffness: 260, damping: 22 });
  const rotateY = useSpring(tiltX, { stiffness: 260, damping: 22 });

  const handleMove = (e: React.MouseEvent) => {
    if (!interactive || reducedMotion) return;
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    tiltX.set(((e.clientX - r.left) / r.width - 0.5) * 14);
    tiltY.set(-((e.clientY - r.top) / r.height - 0.5) * 14);
  };
  const handleLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        ref={frameRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={
          interactive && !reducedMotion
            ? { rotateX, rotateY, transformPerspective: 900 }
            : undefined
        }
        className="relative"
      >
        {/* Golden bloom that fades in behind a revealed card */}
        {revealed && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-5 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(212,175,55,0.4) 0%, rgba(212,175,55,0.08) 55%, transparent 72%)",
            }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
        )}
        <button
          type="button"
          onClick={onFlip}
          disabled={disabled || !cardId}
          aria-label={
            card
              ? revealed
                ? `${card.name}${reversed ? ", reversed" : ""}`
                : "Face-down card, tap to reveal"
              : "Card not dealt"
          }
          className={`perspective-1000 ${SIZES[size]} relative min-h-[8rem] min-w-[5rem] cursor-pointer disabled:cursor-default`}
        >
          {celebrate && <CardBurst />}
          <motion.div
            className="preserve-3d relative h-full w-full"
            initial={false}
            animate={{ rotateY: revealed ? 180 : 0 }}
            transition={{ duration: 0.55, ease: [0.2, 0.7, 0.3, 1] }}
          >
            {/* Back (face down) */}
            <div
              className="card-back-sheen absolute inset-0 overflow-hidden rounded-xl border border-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
              style={{ backfaceVisibility: "hidden" }}
            >
              <Image
                src={CARD_BACK}
                alt=""
                fill
                sizes="(max-width: 640px) 128px, 160px"
                className="object-cover"
                draggable={false}
              />
            </div>
            {/* Face */}
            <div
              className="absolute inset-0 overflow-hidden rounded-xl border border-gold/50 bg-navydeep shadow-[0_8px_30px_rgba(0,0,0,0.6),0_0_24px_rgba(212,175,55,0.15)]"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              {card && (
                <Image
                  src={card.image}
                  alt={card.name}
                  fill
                  sizes="(max-width: 640px) 176px, 224px"
                  className="object-cover"
                  style={reversed ? { transform: "rotate(180deg)" } : undefined}
                  draggable={false}
                />
              )}
            </div>
          </motion.div>
        </button>
      </motion.div>
      {label && (
        <p className="max-w-[10rem] text-center font-display text-sm tracking-wide text-goldbright">
          {label}
        </p>
      )}
      {card && revealed && (
        <p className="max-w-[10rem] text-center text-xs text-mist">
          {orientationKeywords(card, reversed).slice(0, 3).join(" · ")}
        </p>
      )}
    </div>
  );
}

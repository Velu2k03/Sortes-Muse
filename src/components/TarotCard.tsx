"use client";

import Image from "next/image";
import { motion } from "framer-motion";
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
 * A tarot card with a smooth 3D flip. Face down shows the ornate card back;
 * face up shows the Rider-Waite face (rotated 180deg when reversed).
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

  return (
    <div className="flex flex-col items-center gap-2">
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
            className="absolute inset-0 overflow-hidden rounded-xl border border-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
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

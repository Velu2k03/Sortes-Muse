"use client";

import Image from "next/image";
import ravenFull from "@/assets/raven-oracle-full.webp";
import ravenBust from "@/assets/raven-oracle-bust.webp";
import {
  ravenClassForState,
  ravenSizeFor,
  ravenVariantForSize,
  type RavenState,
  type RavenVariant,
} from "@/lib/raven-oracle";
import "./RavenOracle.css";

// Raven Oracle Step 1 (Velu, 2026-11-15; Fable decision 2026-11-15):
// the Duolingo-style reactive mascot, adapted for Sortes. The Raven is
// the emotional layer, not a logo: it sits with the visitor at each
// step of the reading and reacts to what is happening. Gentle and wise
// (Finch-style) only. No guilt, no sick, no dead, no streak pressure,
// no state that punishes the visitor for anything.
//
// ART: C4, Velu's final pick (chubby front-facing dark raven, eyebrows,
// ornate 8-point star tarot card, flat matte vector). Two WebP masters
// with alpha, as static imports so the URL is content-hashed and
// width/height come free: full body at 1024, head-and-shoulders bust
// at 512. The background, glow rays, and sparkles were masked out
// before export; the glow is re-added in CSS (RavenOracle.css).
//
// STATE MACHINE: the six-value prop is the semantic API; the mapping
// to three motion profiles lives in src/lib/raven-oracle.ts (rest,
// thinking, celebrating). There is no raven-owned CardBurst:
// TarotCard already fires one on every reveal, and a second burst
// would stack on top of it. The celebrating state hops once instead.
//
// DECORATIVE: the Raven carries no information the surrounding copy
// does not already say, so it is aria-hidden with an empty alt. The
// state is fixed by the caller's props in the server render; this
// component holds no state, no effect, and no randomness, so it adds
// no client variance to hydration. Reduced motion is already solved:
// the global rule at src/app/globals.css:449 kills all CSS animation
// and MotionProvider covers motion/react, so this file adds no
// reduced-motion check of its own.

export type { RavenState, RavenVariant };

export default function RavenOracle({
  state = "idle",
  size = 160,
  variant = "auto",
  className = "",
  preload = false,
}: {
  state?: RavenState;
  size?: number;
  variant?: RavenVariant;
  className?: string;
  // Next 16: `priority` is deprecated in favour of `preload`
  // (local docs, node_modules/next/dist/docs/.../components/image.md).
  // Nothing currently needs it; the prop exists so a future
  // above-the-fold placement can ask for it explicitly.
  preload?: boolean;
}) {
  const px = ravenSizeFor(size);
  const src = ravenVariantForSize(size, variant) === "bust" ? ravenBust : ravenFull;
  return (
    <div
      className={`${ravenClassForState(state)} ${className}`.trim()}
      aria-hidden="true"
    >
      <Image
        src={src}
        alt=""
        width={px}
        height={px}
        sizes={`${px}px`}
        preload={preload}
      />
    </div>
  );
}

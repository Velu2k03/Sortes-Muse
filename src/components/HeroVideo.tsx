"use client";

import Image from "next/image";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import HeroFanStatic from "./HeroFanStatic";

/**
 * Velu's own Flow deck-shuffle video as the hero visual
 * (Velu decided 2026-11-18, "Go" 2026-11-18): one card centre,
 * flies into a full deck, all cards spin and shuffle mid-air,
 * same card returns front-facing to exactly where it started,
 * seamless loop in composition. No hands, no people, no legible
 * text. The file is his own velu-shared-video.mp4, shipped
 * as-is, only re-encoded for size: 8.96 MB to 2.56 MB
 * (libx264 CRF 26, 1280x720 kept, audio stripped, the source
 * is silent and the video plays muted), plus a poster still
 * taken from its 1s frame, one card alone centre. The video
 * itself is NOT fixed or re-edited: during the shuffle the
 * face-up cards are classic Rider-Waite colours, not purely
 * navy and gold, and the hero card bears a small "X" at the
 * top, both already flagged to Velu.
 *
 * Behaviour: muted, autoplay, loop, playsInline,
 * preload="metadata". Reduced motion: the server renders the
 * poster only, and the video mounts only after hydration when
 * the matchMedia check says motion is fine (HeroScene pattern:
 * mount-then-sync, so no hydration mismatch), so
 * reduced-motion visitors never get an autoplaying video; the
 * poster stays instead, and a first-paint CSS guard in
 * globals.css hides any video element for them too. Load
 * failure: the video's onError falls back to HeroFanStatic,
 * the existing static hero visual, so the hero never shows
 * an empty box.
 */

const VIDEO_SRC = "/videos/hero-deck-shuffle.mp4";
const POSTER_SRC = "/videos/hero-deck-shuffle-poster.jpg";

export default function HeroVideo({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Both setters live inside sync (ScrollProgressBar pattern):
    // a bare setMounted(true) in the effect body trips the
    // repo's react-hooks/set-state-in-effect lint rule.
    const sync = () => {
      setReducedMotion(mq.matches);
      setMounted(true);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Autoplay needs the muted property set, not just the
  // attribute: React's muted attribute does not reliably stick
  // on <video> across browsers, and an unmuted video will not
  // autoplay. play() is best-effort: if the browser still
  // blocks autoplay, the poster stays visible and the video
  // plays on the next user gesture.
  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = true;
      void el.play().catch(() => {});
    }
  }, [mounted, reducedMotion, failed]);

  if (failed) return <HeroFanStatic />;

  const showVideo = mounted && !reducedMotion;
  return (
    <div
      className={clsx(
        "hero-video relative mx-auto aspect-video w-full overflow-hidden rounded-2xl border border-gold/25 shadow-card",
        className,
      )}
      aria-label="Tarot cards shuffling in a deck, looping video"
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-hidden="true"
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          src={POSTER_SRC}
          alt="One tarot card alone at the centre of a deep navy field, gold sun and crescent design"
          fill
          sizes="(max-width: 640px) 100vw, 896px"
          className="object-cover"
        />
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import HeroFanStatic from "./HeroFanStatic";

/**
 * Velu's own Flow deck-shuffle video as the HERO BACKGROUND
 * (Velu decided 2026-11-18, revised 2026-11-18: "make the video
 * as bg, not as a section"): one card centre, flies into a full
 * deck, all cards spin and shuffle mid-air, same card returns
 * front-facing to exactly where it started, seamless loop in
 * composition. No hands, no people, no legible text. The file
 * is his own velu-shared-video.mp4, shipped as-is, only
 * re-encoded for size: 8.96 MB to 2.56 MB (libx264 CRF 26,
 * 1280x720 kept, audio stripped, the source is silent and the
 * video plays muted), plus a poster still taken from its 1s
 * frame, one card alone centre. The video itself is NOT fixed
 * or re-edited: during the shuffle the face-up cards are
 * classic Rider-Waite colours, not purely navy and gold, and
 * the hero card bears a small "X" at the top, both already
 * flagged to Velu.
 *
 * Layout: this component IS the background layer. It renders
 * absolute inset-0 inside a relative hero section, the video
 * (or poster) object-cover full-bleed, with a dark navy scrim
 * (.hero-video-scrim in globals.css) between the video and the
 * hero content, which sits in a relative sibling above it. The
 * scrim has to be strong on purpose: the busiest mid-shuffle
 * frames carry bright cream and yellow cards (The Sun), and
 * bright gold text on bright yellow is unreadable, so it runs
 * 0.78 at the top, 0.85 through the middle where the form and
 * chips sit, 0.94 at the bottom. The video reads as moving
 * navy and gold through it, never as bare cards.
 *
 * Light theme: the whole layer is hidden
 * (html[data-theme="light"] .hero-video-bg in globals.css),
 * the same pattern the old hero photo used (it hid in light
 * theme too). Light-theme text is dark gold and dark navy on
 * paper, and no dark scrim can save that over a dark navy
 * video, so the light hero stays clean paper plus the Orb
 * glow, exactly as before the video. AND the JS does not
 * autoplay a hidden video in light theme (Codex P2, PR #163):
 * the component tracks the live theme from
 * documentElement.dataset.theme, subscribing to the
 * sortes-theme-change window event the Header toggle
 * dispatches and to a MutationObserver on data-theme, which
 * also catches the Header's OS-following path that sets the
 * attribute without dispatching the event. In light theme the
 * component renders nothing at all, so no video element
 * mounts, no 2.5 MB is downloaded or decoded, and no poster
 * is fetched either; the CSS hide rule stays as a first-paint
 * belt-and-braces for the server HTML. Toggling theme
 * mid-session mounts the video when going light to dark and
 * unmounts it when going dark to light.
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
 * the existing static hero visual, centred inside the same
 * background layer under the same scrim, so the hero never
 * shows an empty box.
 */

const VIDEO_SRC = "/videos/hero-deck-shuffle.mp4";
const POSTER_SRC = "/videos/hero-deck-shuffle-poster.jpg";

export default function HeroVideo() {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isDark, setIsDark] = useState(false);
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

  // Live theme, same mount-then-sync pattern so there is no
  // hydration mismatch: the server renders the poster, the
  // client syncs from documentElement.dataset.theme, which the
  // layout inline script already set before paint. Two
  // subscriptions because the Header has two writers: the
  // toggle sets the attribute AND dispatches
  // sortes-theme-change, while the OS-following path sets the
  // attribute without dispatching, so the MutationObserver on
  // data-theme catches that one too.
  useEffect(() => {
    const syncTheme = () => {
      setIsDark(document.documentElement.dataset.theme !== "light");
    };
    syncTheme();
    window.addEventListener("sortes-theme-change", syncTheme);
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      window.removeEventListener("sortes-theme-change", syncTheme);
      observer.disconnect();
    };
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
  }, [mounted, reducedMotion, isDark, failed]);

  // Light theme: render nothing. The layer is hidden by CSS
  // anyway, and mounting a video here would autoplay, download
  // and decode 2.5 MB nobody sees (Codex P2, PR #163). The
  // server still renders the poster below, so first paint is
  // unchanged; this only takes effect after hydration.
  if (mounted && !isDark) {
    return null;
  }

  if (failed) {
    return (
      <div
        className="hero-video hero-video-bg absolute inset-0 overflow-hidden bg-navydeep"
        aria-label="Tarot cards shuffling in a deck, looping video"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <HeroFanStatic />
        </div>
        <div className="hero-video-scrim absolute inset-0" aria-hidden="true" />
      </div>
    );
  }

  const showVideo = mounted && !reducedMotion && isDark;
  return (
    <div
      className="hero-video hero-video-bg absolute inset-0 overflow-hidden"
      aria-label="Tarot cards shuffling in a deck, looping video"
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
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
          sizes="100vw"
          className="object-cover"
        />
      )}
      {/* Scrim between the video and the hero content above it:
          strong on purpose, see the comment at the top of this
          file and .hero-video-scrim in globals.css. */}
      <div className="hero-video-scrim absolute inset-0" aria-hidden="true" />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import "./HoloCard.css";

// Phase 4B (4.11): the WebGL foil shader is gone. It rendered a
// rainbow iridescent sheen (a hue() ramp across blue, green, yellow,
// orange and pink, plus rainbow sparkles) even on the "gold" preset,
// which fought the 1909 Rider-Waite-Smith art. Taming it would have
// meant fighting the shader; the simpler correct effect is pure CSS:
// a warm gold radial highlight that follows the pointer, a thin gold
// rim, and the same gentle tilt + lift on hover. No rainbow anywhere.
// The component API is unchanged, so the daily page and CardModal
// callers did not change: preset, foilColor and intensity still
// accepted, but every preset now renders the same warm gold light
// (foilColor tints it, intensity scales it). Phase F: the four
// accepted-and-ignored props (scale, edgeSparkle, frame, glare) were
// removed; callers never passed them.
export type HoloPreset =
  | "bursts"
  | "stars"
  | "shards"
  | "cosmos"
  | "rainbow"
  | "swirl"
  | "glitter"
  | "gold";

const PERSPECTIVE = 1100;
const CARD_RATIO = 63 / 88;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface HoloCardProps {
  image: string;
  backImage?: string;
  alt?: string;
  preset?: HoloPreset;
  foilColor?: string;
  intensity?: number;
  tiltMax?: number;
  hoverScale?: number;
  radius?: number;
  width?: number;
  idle?: boolean;
  shadow?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface HoloSettings {
  intensity: number;
  foil: string;
  tiltMax: number;
  hoverScale: number;
  idle: boolean;
}

export default function HoloCard({
  image,
  backImage,
  alt = "",
  preset = "bursts",
  intensity = 0.85,
  foilColor = "#d4af37",
  width = 320,
  radius = 14,
  tiltMax = 14,
  hoverScale = 1.04,
  idle = true,
  shadow = true,
  className = "",
  style,
}: HoloCardProps) {
  // Accepted for API compatibility; the rainbow presets no longer
  // change the look. Referenced so the props are not silently dead.
  void preset;
  const rootRef = useRef<HTMLDivElement>(null);
  const rotorRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const settingsRef = useRef<HoloSettings | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, inside: false });
  const wakeRef = useRef<(() => void) | null>(null);
  const flipRef = useRef(false);
  const [ratio, setRatio] = useState(CARD_RATIO);
  const [ready, setReady] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const flippable = Boolean(backImage);

  // Phase 4C lint: latest settings/flip refs synced in an effect, not
  // during render. Both are read only from the rAF tick, which runs
  // after commit, and this effect is declared before the wake effect
  // below, so the loop starts with fresh values.
  useEffect(() => {
    settingsRef.current = {
      intensity: clamp(intensity, 0, 1),
      foil: foilColor,
      tiltMax: clamp(tiltMax, 0, 45),
      hoverScale: clamp(hoverScale, 0.8, 1.3),
      idle,
    };
    flipRef.current = flippable && flipped;
  });

  useEffect(() => {
    wakeRef.current?.();
  });

  // The image itself drives readiness now that there is no GL
  // texture to upload: the sheen fades in once the art has loaded.
  // Reset when the image changes, so a new card does not flash the
  // old one's ready state. The reset is queued as a microtask (the
  // same pattern ChartsClient uses for its saved-language restore),
  // so it runs before the new image's load event but is not a
  // synchronous setState inside the effect body.
  useEffect(() => {
    queueMicrotask(() => setReady(false));
  }, [image]);

  useEffect(() => {
    const root = rootRef.current;
    const rotor = rotorRef.current;
    if (!root || !rotor) return undefined;

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const state = {
      tiltX: 0,
      tiltY: 0,
      tiltVX: 0,
      tiltVY: 0,
      lightX: 0.36,
      lightY: 0.26,
      lightVX: 0,
      lightVY: 0,
      lift: 1,
      liftV: 0,
      turn: 0,
      turnV: 0,
      glow: 0,
      glowV: 0,
      clock: Math.random() * 40,
    };
    let raf = 0;
    let last = 0;
    let visible = true;
    let alive = true;
    let calm = 0;

    const spring = (
      value: number,
      velocity: number,
      target: number,
      stiffness: number,
      damping: number,
      dt: number
    ): [number, number] => {
      const next = velocity + ((target - value) * stiffness - velocity * damping) * dt;
      return [value + next * dt, next];
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      const s = settingsRef.current;
      if (!s) return;
      const pointer = pointerRef.current;
      let targetX = 0;
      let targetY = 0;
      let lightX = 0.36;
      let lightY = 0.26;
      let lift = 1;
      let glow = 0;
      const drifting = s.idle && !reduce && !pointer.inside;
      if (pointer.inside && !reduce) {
        targetX = (0.5 - pointer.y) * 2 * s.tiltMax;
        targetY = (pointer.x - 0.5) * 2 * s.tiltMax;
        lightX = pointer.x;
        lightY = pointer.y;
        lift = s.hoverScale;
        glow = 1;
      } else if (drifting) {
        state.clock += dt;
        const t = state.clock;
        targetX = Math.sin(t * 0.7) * s.tiltMax * 0.28;
        targetY = Math.sin(t * 0.53 + 1.2) * s.tiltMax * 0.4;
        lightX = 0.5 + Math.sin(t * 0.41) * 0.42;
        lightY = 0.38 + Math.sin(t * 0.33 + 0.6) * 0.3;
        glow = 0.45;
      }
      const steps = Math.ceil(dt / (1 / 240));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        [state.tiltX, state.tiltVX] = spring(state.tiltX, state.tiltVX, targetX, 150, 16, h);
        [state.tiltY, state.tiltVY] = spring(state.tiltY, state.tiltVY, targetY, 150, 16, h);
        [state.lightX, state.lightVX] = spring(state.lightX, state.lightVX, lightX, 220, 30, h);
        [state.lightY, state.lightVY] = spring(state.lightY, state.lightVY, lightY, 220, 30, h);
        [state.lift, state.liftV] = spring(state.lift, state.liftV, lift, 320, 30, h);
        [state.turn, state.turnV] = reduce
          ? [flipRef.current ? 180 : 0, 0]
          : spring(state.turn, state.turnV, flipRef.current ? 180 : 0, 170, 20, h);
        [state.glow, state.glowV] = spring(state.glow, state.glowV, glow, 220, 30, h);
      }
      rotor.style.transform = `perspective(${PERSPECTIVE}px) scale(${state.lift}) rotateX(${state.tiltX}deg) rotateY(${state.tiltY + state.turn}deg)`;
      root.style.setProperty("--hc-lx", `${(state.lightX * 100).toFixed(2)}%`);
      root.style.setProperty("--hc-ly", `${(state.lightY * 100).toFixed(2)}%`);
      root.style.setProperty("--hc-glow", state.glow.toFixed(3));
      if (shadowRef.current) {
        shadowRef.current.style.transform = `translate(${-state.tiltY * 0.7}px, ${state.tiltX * 0.7}px) scale(${0.9 + (state.lift - 1) * 1.5})`;
      }
      const motion =
        Math.abs(state.tiltVX) +
        Math.abs(state.tiltVY) +
        Math.abs(state.liftV) * 40 +
        Math.abs(state.turnV) +
        (Math.abs(state.lightVX) + Math.abs(state.lightVY)) * 60 +
        Math.abs(state.glowV) * 40 +
        Math.abs(state.tiltX - targetX) +
        Math.abs(state.tiltY - targetY);
      calm = motion > 0.02 ? 0 : calm + dt;
      if (!visible || (!drifting && !pointer.inside && calm > 0.3)) return;
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf || !alive) return;
      calm = 0;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    const visibility = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    });
    visibility.observe(root);
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      visibility.disconnect();
    };
  }, []);

  const track = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" && e.type === "pointermove" && !e.buttons) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
      inside: true,
    };
    wakeRef.current?.();
  };

  const leave = () => {
    pointerRef.current = { ...pointerRef.current, inside: false };
    wakeRef.current?.();
  };

  const toggle = () => {
    if (flippable) setFlipped((value) => !value);
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
    setReady(true);
  };

  return (
    <div
      ref={rootRef}
      className={`holo-card${className ? ` ${className}` : ""}`}
      role={flippable ? "button" : "img"}
      tabIndex={flippable ? 0 : undefined}
      aria-label={alt || undefined}
      aria-pressed={flippable ? flipped : undefined}
      data-ready={ready ? "" : undefined}
      data-flippable={flippable ? "" : undefined}
      onPointerEnter={track}
      onPointerMove={track}
      onPointerDown={track}
      onPointerLeave={leave}
      onPointerCancel={leave}
      onClick={toggle}
      onKeyDown={(e) => {
        if (!flippable || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        if (!e.repeat) toggle();
      }}
      style={{
        "--hc-w": `${width}px`,
        "--hc-ratio": ratio,
        "--hc-radius": `${radius}px`,
        "--hc-foil": foilColor,
        "--hc-intensity": clamp(intensity, 0, 1),
        ...style,
      } as CSSProperties}
    >
      {shadow ? (
        <span ref={shadowRef} className="holo-card__shadow" aria-hidden="true" />
      ) : null}
      <div ref={rotorRef} className="holo-card__rotor">
        <div className="holo-card__face holo-card__face--front">
          {image ? (
            // Phase 4C lint: next/image wraps the image in a positioned
            // span, which breaks this 3D face (the img must be the direct
            // child the rotor transform and sheen overlay expect), and
            // the onLoad/onError handlers gate the ready state. A plain
            // img is correct here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" draggable={false} onLoad={onImageLoad} onError={() => setReady(true)} />
          ) : null}
          <span className="holo-card__sheen" aria-hidden="true" />
        </div>
        {flippable && backImage ? (
          <div className="holo-card__face holo-card__face--back">
            {/* Phase 4C lint: same 3D-face reason as the front image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backImage} alt="" draggable={false} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Raven Oracle Step 1: the pure logic for the mascot's state machine.
// No CSS, no images, no React here, so the wiring tests can import
// these helpers directly. The component (RavenOracle.tsx) is only the
// view: it maps the variant to a static image import and renders it.
//
// SIX STATES, THREE PROFILES (Fable decision 2026-11-15): the
// six-value prop is the semantic API (callers say what is happening),
// but one static image cannot show six visibly different ravens, so
// the code maps them to three motion profiles. rest = idle, gentle,
// listening (listening leans in); thinking = thinking, revealing
// (slower bob, head tilt, gold glow pulse); celebrating = a one-shot
// hop. Nobody should expect six visibly different ravens.

export type RavenState =
  | "idle"
  | "listening"
  | "thinking"
  | "revealing"
  | "gentle"
  | "celebrating";

export const RAVEN_STATES: readonly RavenState[] = [
  "idle",
  "listening",
  "thinking",
  "revealing",
  "gentle",
  "celebrating",
];

// The three visible motion profiles. One decision in one place.
export type RavenProfile = "rest" | "thinking" | "celebrating";

export function ravenProfileForState(state: RavenState): RavenProfile {
  switch (state) {
    case "thinking":
    case "revealing":
      return "thinking";
    case "celebrating":
      return "celebrating";
    case "idle":
    case "listening":
    case "gentle":
    default:
      return "rest";
  }
}

// Full body reads at 96px and above; below that the head-and-shoulders
// bust takes over, because the full body is too small to read. Nothing
// renders below 40px: the size is clamped, never shrunk past it.
export const RAVEN_MIN_SIZE = 40;
export const RAVEN_BUST_BELOW = 96;

export type RavenVariant = "auto" | "full" | "bust";

export function ravenSizeFor(size: number): number {
  return Math.max(RAVEN_MIN_SIZE, Math.round(size));
}

export function ravenVariantForSize(size: number, variant: RavenVariant): "full" | "bust" {
  if (variant === "bust") return "bust";
  if (variant === "full") return "full";
  return ravenSizeFor(size) < RAVEN_BUST_BELOW ? "bust" : "full";
}

// The full class string for a state: profile class plus the listening
// lean. The lean is a modifier, not a fourth profile.
export function ravenClassForState(state: RavenState): string {
  const profile = ravenProfileForState(state);
  const lean = state === "listening" ? " raven-oracle--lean" : "";
  return `raven-oracle raven-oracle--${profile}${lean}`;
}

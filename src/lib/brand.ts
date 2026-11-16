// Brand colours as literal hex values.
//
// Most of the app reads the brand from CSS variables (see globals.css
// @theme). But two places cannot: html-to-image share cards (ShareReading,
// ChartSections) and email HTML (src/lib/email.ts). Those import the hex
// values from here instead of hardcoding them, so the palette has one
// source of truth. Keep this in step with the @theme tokens.

export const BRAND = {
  /** Navy, the main dark background. */
  navy: "#0f1e36",
  /** Deep navy, the browser chrome / theme colour. */
  navyDeep: "#0a1526",
  /** Panel, the dark surface colour. */
  panel: "#1a2a44",
  /** Ink, the darkest text colour. */
  ink: "#0b1424",
  /** Gold, the brand accent. */
  gold: "#b9975b",
  /** Bright gold, the lighter gold for highlights. */
  goldBright: "#d6be8a",
  /** Cream, the main light text colour. */
  cream: "#faf6ec",
  /** Mist, the muted text colour. */
  mist: "#9ca3af",
  /** Danger, the error colour. */
  danger: "#f87171",
} as const;

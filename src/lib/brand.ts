// Brand colours as literal hex values.
//
// Most of the app reads the brand from CSS variables (see globals.css
// @theme). But two places cannot: html-to-image share cards (ShareReading,
// ChartSections) and email HTML (src/lib/email.ts). Those import the hex
// values from here instead of hardcoding them, so the palette has one
// source of truth. Keep this in step with the @theme tokens.

export const BRAND = {
  /** Navy, the main dark background. */
  navy: "#141b2e",
  /** Deep navy, the browser chrome / theme colour. */
  navyDeep: "#0f1424",
  /** Panel, the dark surface colour. */
  panel: "#1a1f2e",
  /** Ink, the darkest text colour. */
  ink: "#0a0e1a",
  /** Gold, the brand accent. */
  gold: "#d4af37",
  /** Bright gold, the lighter gold for highlights. */
  goldBright: "#f4d03f",
  /** Cream, the main light text colour. */
  cream: "#ede6d6",
  /** Mist, the muted text colour. */
  mist: "#9ca3af",
  /** Danger, the error colour. */
  danger: "#f87171",
} as const;

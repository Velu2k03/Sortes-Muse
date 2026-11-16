import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

// Sortes navy+gold theme for the Astryx scoped pilot (pricing page
// only, Velu 2026-11-14). Extends the neutral theme and overrides
// only the semantic tokens that carry the brand: navy surfaces,
// cream text, gold accent, Cormorant Garamond display, Manrope body.
// Brand lock (Velu, 2026-11-16): Navy #141b2e, Gold #d4af37,
// Cream #ede6d6. Replaces the 2026-11-15 bronze lock. The fonts are
// already loaded by next/font in the
// root layout, so naming the families here resolves to the loaded
// files. Token values are [light, dark] tuples; the pricing page
// forces dark mode, so the dark stop is the one visitors see. Light
// stops follow the app's light theme (cream #ede6d6, navy text
// #141b2e, dark gold #7c5e00, about 4.9:1 on cream).
// Built with `npx astryx theme build` (see sortesTheme.css/js
// beside this file); never hand-edit the built artifacts.
export const sortesTheme = defineTheme({
  name: "sortes",
  extends: neutralTheme,
  typography: {
    scale: { base: 16, ratio: 1.2 },
    body: {
      family: "Manrope",
      fallbacks: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    },
    heading: {
      family: "Cormorant Garamond",
      fallbacks: '"Times New Roman", Georgia, serif',
      weight: "semibold",
      weights: { 1: "bold", 2: "bold" },
    },
  },
  tokens: {
    "--color-accent": ["#7c5e00", "#d4af37"],
    "--color-accent-muted": ["#d4af3733", "#d4af3733"],
    "--color-on-accent": ["#ffffff", "#14100a"],
    "--color-text-accent": ["#7c5e00", "#f4d03f"],
    "--color-icon-accent": ["#7c5e00", "#f4d03f"],
    "--color-background-body": ["#ede6d6", "#0a0e1a"],
    "--color-background-surface": ["#ffffff", "#141b2e"],
    "--color-background-card": ["#ffffff", "#1a1f2e"],
    "--color-background-muted": ["#f1ead8", "#1a1f2e"],
    "--color-background-popover": ["#ffffff", "#1a1f2e"],
    "--color-text-primary": ["#141b2e", "#ede6d6"],
    "--color-text-secondary": ["#5c5a52", "#9ca3af"],
    "--color-border": ["#d8c98f", "rgba(212, 175, 55, 0.35)"],
    "--color-border-emphasized": ["#7c5e00", "#d4af37"],
    "--color-background-inverted": ["#141b2e", "#ede6d6"],
  },
});

import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

// Sortes navy+gold theme for the Astryx scoped pilot (pricing page
// only, Velu 2026-11-14). Extends the neutral theme and overrides
// only the semantic tokens that carry the brand: navy surfaces,
// cream text, gold accent, Cormorant Garamond display, Manrope body.
// Brand lock (Velu, 2026-11-15): Navy #0F1E36, Gold #B9975B,
// Cream #FAF6EC. The fonts are already loaded by next/font in the
// root layout, so naming the families here resolves to the loaded
// files. Token values are [light, dark] tuples; the pricing page
// forces dark mode, so the dark stop is the one visitors see. Light
// stops follow the app's light theme (cream #faf6ec, navy text
// #0f1e36, dark gold #8a6d0a, about 5.6:1 on cream).
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
    "--color-accent": ["#8a6d0a", "#b9975b"],
    "--color-accent-muted": ["#b9975b33", "#b9975b33"],
    "--color-on-accent": ["#ffffff", "#14100a"],
    "--color-text-accent": ["#8a6d0a", "#d6be8a"],
    "--color-icon-accent": ["#8a6d0a", "#d6be8a"],
    "--color-background-body": ["#faf6ec", "#0b1424"],
    "--color-background-surface": ["#ffffff", "#0f1e36"],
    "--color-background-card": ["#ffffff", "#1a2a44"],
    "--color-background-muted": ["#f1ead8", "#1a2a44"],
    "--color-background-popover": ["#ffffff", "#1a2a44"],
    "--color-text-primary": ["#0f1e36", "#faf6ec"],
    "--color-text-secondary": ["#5c5a52", "#9ca3af"],
    "--color-border": ["#d8c98f", "rgba(185, 151, 91, 0.35)"],
    "--color-border-emphasized": ["#8a6d0a", "#b9975b"],
    "--color-background-inverted": ["#0f1e36", "#faf6ec"],
  },
});

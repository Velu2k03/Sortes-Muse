"use client";

import type { CSSProperties } from "react";
import { Toaster } from "sonner";

// The one app-wide toast host. Brand tokens only (panel, cream, gold);
// fonts are inherited from the page (Cormorant Garamond + Manrope).
const toasterStyle = {
  "--normal-bg": "var(--color-panel)",
  "--normal-text": "var(--color-cream)",
  "--normal-border": "var(--color-gold)",
  fontFamily: "var(--font-body)",
} as CSSProperties;

export default function SonnerToaster() {
  return (
    <Toaster
      position="bottom-right"
      duration={4000}
      closeButton
      style={toasterStyle}
      toastOptions={{
        actionButtonStyle: {
          background: "var(--color-gold)",
          color: "var(--color-panel)",
        },
      }}
    />
  );
}

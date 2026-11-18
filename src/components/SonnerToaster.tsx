"use client";

import type { CSSProperties } from "react";
import { Toaster } from "sonner";

// The one app-wide toast host. Brand tokens only (panel, cream, gold);
// fonts are inherited from the page (Cinzel + Jost).
// mobileOffset keeps failure toasts above the iOS home indicator:
// layout.tsx sets viewportFit "cover", so the bottom safe-area inset
// must be added to Sonner's 16px mobile bottom offset (the deleted
// SwipeToast used bottom-[calc(16px+env(safe-area-inset-bottom,0px))]).
// Only bottom is overridden; the other sides keep Sonner's 16px default.
const mobileOffset = {
  bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
};
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
      mobileOffset={mobileOffset}
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

"use client";

import { useEffect } from "react";

/**
 * Batch 6c: the methodology sections are closed <details> by
 * default, and the table of contents links to them by id (the id
 * sits on the <section>, whose h2 is always visible). When a link
 * (or a pasted URL) points at a section, open the <details> inside
 * it, so the jump lands on readable content instead of a closed
 * heading. Same pattern as FaqList's openHash. Renders nothing.
 */
export default function MethodologyHashOpener() {
  useEffect(() => {
    const openHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;
      const el = document.getElementById(hash);
      if (!el) return;
      const details =
        el.tagName === "DETAILS" ? el : el.querySelector("details");
      if (details) {
        (details as HTMLDetailsElement).open = true;
        el.scrollIntoView();
      }
    };
    openHash();
    window.addEventListener("hashchange", openHash);
    return () => window.removeEventListener("hashchange", openHash);
  }, []);
  return null;
}

"use client";

import { useEffect, useRef } from "react";

// Focusable elements inside a dialog, in DOM order. Disabled controls
// are excluded; [tabindex="-1"] elements are programmatic-only.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap for modal dialogs (UX P0-4). Attach the returned ref to
 * the dialog panel and pass `active` true while the dialog is open:
 * focus moves into the dialog on open (first focusable control, else
 * the panel itself), Tab / Shift+Tab cycle inside it, Escape calls
 * onClose, and focus returns to the element that opened the dialog
 * when it closes.
 *
 * onClose is read through a ref so a parent that passes a new
 * function identity each render does not re-run the effect (which
 * would yank focus back to the trigger mid-dialog).
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose?: () => void
) {
  const ref = useRef<T | null>(null);
  const previousFocus = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  // Keep the latest onClose without re-running the trap effect when
  // the parent passes a new function identity each render.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    previousFocus.current = document.activeElement;

    const focusables = (): HTMLElement[] =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    const first = focusables()[0];
    if (first) {
      first.focus();
    } else {
      el.setAttribute("tabindex", "-1");
      el.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const prev = previousFocus.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [active]);

  return ref;
}

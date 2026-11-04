"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { dismissInstallBanner, installBannerDismissed, promptShownThisSession, markPromptShownThisSession } from "@/lib/storage";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Delayed, non-intrusive PWA install banner. Only appears after the browser
 * fires beforeinstallprompt (never on first paint), and is easy to dismiss.
 * On iOS Safari (no beforeinstallprompt) shows Share -> Add to Home Screen
 * instructions once, dismissible.
 */
export default function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (installBannerDismissed()) return;
    // Small delay so it never blocks the first paint or the first reading.
    const t = setTimeout(() => {
      const isIOS =
        /iphone|ipad|ipod/i.test(navigator.userAgent) &&
        !(window as Window & { MSStream?: unknown }).MSStream;
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!isStandalone && isIOS && !promptShownThisSession()) {
        markPromptShownThisSession();
        setShowIOS(true);
      }
    }, 12000);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (promptShownThisSession()) return;
      markPromptShownThisSession();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const hide = () => {
    dismissInstallBanner();
    setVisible(false);
    setShowIOS(false);
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    hide();
  };

  // WCAG 2.4.11 focus not obscured (minimum): a fixed bottom banner
  // can entirely cover a focused element near the foot of the page.
  // While the banner is shown, reserve its height as body padding so
  // content can scroll fully above it; the banner then overlays
  // padding, never content. Padding is restored on dismiss/unmount.
  // Codex fresh review on PR 53, correct: a fixed 190px reserve
  // fails when zoom or large text wraps the banner taller, so the
  // reserve tracks the rendered height via ResizeObserver, plus a
  // 24px gap so the last line never sits flush under the banner.
  const bannerShown = visible || showIOS;
  useEffect(() => {
    if (!bannerShown) return;
    const prev = document.body.style.paddingBottom;
    const apply = () => {
      const h = bannerRef.current?.offsetHeight ?? 0;
      if (h > 0) document.body.style.paddingBottom = `${h + 24}px`;
      // Codex fresh review on PR 53, correct: padding alone only
      // extends the scroll range. If focus is already on a control
      // the new banner covers, nudge the page just enough to bring
      // that control clear of the banner top.
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && h > 0) {
        const rect = active.getBoundingClientRect();
        // Codex fresh review on PR 53, correct: at sm widths and
        // above the banner sits 24px above the viewport bottom
        // (bottom-6), so innerHeight minus height is 24px below
        // the real banner top and a control in that strip stays
        // covered. Use the rendered top edge instead.
        const bannerTop = bannerRef.current?.getBoundingClientRect().top ?? window.innerHeight - h;
        if (rect.bottom > bannerTop && rect.top < window.innerHeight) {
          window.scrollBy(0, rect.bottom - bannerTop + 16);
        }
      }
    };
    apply();
    const el = bannerRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(apply) : null;
    if (el && ro) ro.observe(el);
    return () => {
      ro?.disconnect();
      document.body.style.paddingBottom = prev;
    };
  }, [bannerShown]);

  if (!visible && !showIOS) return null;

  return (
    <div
      ref={bannerRef}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-gold/40 bg-navydeep/95 p-4 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6"
      role="dialog"
      aria-label="Install Sortes"
    >
      <div className="flex items-start gap-3">
        <Image
          src="/brand/logo.webp"
          alt=""
          width={48}
          height={48}
          className="rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-goldbright">Install Sortes</p>
          <p className="mt-0.5 text-xs leading-relaxed text-mist">
            {showIOS
              ? "Tap Share, then Add to Home Screen for the full app experience and offline readings."
              : "Add Sortes to your home screen for instant readings, offline access, and daily card reminders."}
          </p>
        </div>
        <button
          type="button"
          onClick={hide}
          aria-label="Dismiss install prompt"
          className="rounded-lg p-1.5 text-mist hover:text-cream"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {!showIOS && deferred && (
          <button
            type="button"
            onClick={install}
            className="btn-gold flex-1 rounded-xl px-4 py-2.5 text-sm font-bold"
          >
            Install app
          </button>
        )}
        <button
          type="button"
          onClick={hide}
          className="btn-ghost flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

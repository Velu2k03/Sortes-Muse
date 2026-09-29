"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { dismissInstallBanner, installBannerDismissed } from "@/lib/storage";

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

  useEffect(() => {
    if (installBannerDismissed()) return;
    // Small delay so it never blocks the first paint or the first reading.
    const t = setTimeout(() => {
      const isIOS =
        /iphone|ipad|ipod/i.test(navigator.userAgent) &&
        !(window as unknown as { MSStream?: unknown }).MSStream;
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!isStandalone && isIOS) setShowIOS(true);
    }, 12000);

    const onPrompt = (e: Event) => {
      e.preventDefault();
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

  if (!visible && !showIOS) return null;

  return (
    <div
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

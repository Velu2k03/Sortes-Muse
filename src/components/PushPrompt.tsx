"use client";

import { useEffect, useState } from "react";
import { dismissPushPrompt, pushPromptDismissed, getDailyStreak } from "@/lib/storage";

/**
 * Gentle, easy-to-dismiss prompt for daily-card push reminders.
 * Appears only after engagement (delayed), never on first paint.
 * Copy adapts to the seeker's streak: "keep your N-day streak alive"
 * converts far better than a generic reminder.
 */
export default function PushPrompt() {
  const [visible, setVisible] = useState(false);
  const [streak, setStreak] = useState(0);
  const [supported] = useState(
    () => typeof window !== "undefined" && "Notification" in window
  );

  useEffect(() => {
    if (!supported || pushPromptDismissed()) return;
    if (Notification.permission !== "default") return;
    const t = setTimeout(() => {
      setStreak(getDailyStreak());
      setVisible(true);
    }, 45000);
    return () => clearTimeout(t);
  }, [supported]);

  const hide = () => {
    dismissPushPrompt();
    setVisible(false);
  };

  const enable = async () => {
    try {
      await Notification.requestPermission();
    } finally {
      hide();
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-gold/30 bg-navydeep/95 p-4 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:left-6"
      role="dialog"
      aria-label="Daily card reminders"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl">🔔</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-goldbright">
            {streak >= 2
              ? `Keep your ${streak}-day streak alive 🔥`
              : "Your daily card is ready"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-mist">
            {streak >= 2
              ? `You have drawn ${streak} days in a row. Get a gentle nudge each morning so the streak never breaks. You can turn this off anytime.`
              : "Get a gentle nudge each morning when a new card is drawn for you. You can turn this off anytime."}
          </p>
        </div>
        <button
          type="button"
          onClick={hide}
          aria-label="Dismiss reminder prompt"
          className="rounded-lg p-1.5 text-mist hover:text-cream"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={enable}
          className="btn-gold flex-1 rounded-xl px-4 py-2.5 text-sm font-bold"
        >
          Remind me daily
        </button>
        <button
          type="button"
          onClick={hide}
          className="btn-ghost flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

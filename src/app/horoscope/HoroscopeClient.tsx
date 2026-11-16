"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { dailyHoroscope, weeklyHoroscope, SUN_SIGNS, type SunSign } from "@/lib/daily";
import Icon from "@/components/Icon";
import ThemedDatePicker from "@/components/ThemedDatePicker";
import AnimatedContent from "@/components/AnimatedContent";
import RubberSegment from "@/components/RubberSegment";
import { ClickSpark, StarBorder } from "@/components/ReactBits";

// Daily sun-sign horoscope. Text is written in-house for Sortes, dated,
// and clearly labelled as a general reflection, not a personal reading
// and not a prediction. No external horoscope API is used: aztro was
// checked live on 2026-11-01 and did not respond from this environment,
// and its text is generic sun-sign copy. This page is free, unsaved,
// and uncharged, and it does not ask for any birth data.
//
// Phase A reveal: the user picks a sign and a date, taps Reveal, and the
// result appears with a plain sign line and a rise animation body.
// Phase B adds a short unveiling beat (1200ms, wait-and-reward pacing
// Velu allowed 2026-11-04). The beat is presentation only: the text is
// local and already computed, and the status line says Loading, never
// calculating. Under reduced motion the reveal is instant. Changing the
// sign, date, or view resets to unrevealed.
// Phase 6 (D2): the date used to be computed at module level
// (`new Date()` at import time). The server rendered one day, the
// client hydrated with another across midnight/zone boundaries, and
// React threw hydration error #418. The server now passes its UTC
// date in as initialDate (same on both sides for the first render),
// and the effect replaces it with the real local date once mounted.
function todayKeyFor(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Locale-neutral, deterministic (same on server and client): 8 November 2026.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export default function HoroscopeClient({
  initialSign,
  initialDate,
}: {
  initialSign: SunSign;
  initialDate: string;
}) {
  const [sign, setSign] = useState<SunSign>(initialSign);
  // AF-088: false on the server and first client render, so the HTML
  // carries the reflection as plain text; true after mount, when the
  // reveal flow takes over.
  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState("");
  const [todayKey, setTodayKey] = useState("");
  // Client-only: set the real local date after mount (see D2 above).
  // Deferred via setTimeout so the effect body itself does not call
  // setState synchronously (react-hooks/set-state-in-effect); the
  // zero-delay callback runs after first paint, so the server render
  // and the first client render still agree on the fallback.
  useEffect(() => {
    const t = setTimeout(() => {
      const key = todayKeyFor(new Date());
      setTodayKey(key);
      setMounted(true);
      setDate((d) => d || key);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const effectiveDate = date || todayKey || initialDate;
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [view, setView] = useState<"daily" | "weekly">("daily");
  // RubberSegment follows the document theme here (2026-11-04),
  // instead of keeping its dark track in light mode. The sign grid
  // uses CSS tokens, so it needs no theme tracking.
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const sync = () =>
      setSiteTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );
  const resetReveal = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setRevealed(false);
    setRevealing(false);
  };
  const handleReveal = () => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    setRevealing(true);
    revealTimer.current = setTimeout(() => {
      setRevealing(false);
      setRevealed(true);
    }, 1200);
  };
  const h = dailyHoroscope(sign, effectiveDate);
  const w = weeklyHoroscope(sign, effectiveDate);
  const signLine = view === "daily" ? `${h.sign} · ${longDate(h.date)}` : `${w.sign} · Week starting ${longDate(w.weekStart)}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-sm text-gold"><Icon name="iconoirSun" size={18} />Daily Horoscope</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">Today&apos;s sun-sign reflection</h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          A general reflection for your sun sign. Free, unsaved, no birth data needed.
        </p>
      </div>
      {/* UX audit Phase 2, F28: the Sun sign used to be a spinning
          wheel with a select under reduced motion, plus a 12-sign
          link grid below the page doing the same job. The wheel
          duplicated the grid, and its blurred next sign read as a
          broken render in a still. One picker now: a grid of
          buttons, the same control for everyone, no motion needed.
          The wheel component is deleted (nothing else used it). */}
      <div className="mx-auto mt-8 rounded-3xl border border-gold/25 bg-panel/70 p-6">
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-cream">
            Sun sign
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {SUN_SIGNS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === sign}
                onClick={() => { setSign(s); resetReveal(); }}
                className={`min-h-11 rounded-full px-4 py-3 text-sm font-semibold transition ${s === sign ? "bg-gold text-ink" : "border border-gold/30 text-cream/90 hover:bg-gold/10"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <label htmlFor="horoscope-date" className="mb-1.5 block text-sm font-medium text-cream">
            Date
          </label>
          <ThemedDatePicker id="horoscope-date" value={date} onChange={(d) => { setDate(d); resetReveal(); }} />
        </div>
      </div>
      <div className="mt-8 flex justify-center">
        <RubberSegment
          items={[
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
          ]}
          value={view}
          onChange={(v) => { setView(v as "daily" | "weekly"); resetReveal(); }}
          aria-label="Daily or weekly"
          trackColor="var(--color-panel)"
          thumbColor="var(--color-gold)"
          textColor="var(--color-mist)"
          activeTextColor="var(--color-ink)"
          className={siteTheme === "light" ? "ring-1 ring-gold/25" : ""}
        />
      </div>
      <div className="mt-8 text-center">
        {mounted && !revealed && !revealing && (
          <StarBorder radius="1rem">
            <ClickSpark>
              <button
                type="button"
                onClick={handleReveal}
                className="btn-gold rounded-2xl px-8 py-3.5 text-lg font-bold"
              >
                {view === "daily" ? "Reveal Today's Horoscope" : "Reveal This Week's Horoscope"}
              </button>
            </ClickSpark>
          </StarBorder>
        )}
      </div>
      {revealing ? (
        <p className="mt-6 animate-pulse text-center text-sm text-gold motion-reduce:animate-none">
          Loading…
        </p>
      ) : // UX audit Phase 2, F28: the helper line "Choose your sign
      // and date, then reveal your reflection" repeated what the
      // button already says. Nothing renders here before the reveal
      // now; the button is the action.
      mounted && !revealed ? null : (
        <article className="mt-6 rounded-3xl border border-gold/25 bg-panel/70 p-6">
          {/* Phase 2, 2.2: the sign line used to type itself out with
              fake typos. It renders in full now, like the body below. */}
          <p className="text-sm text-gold">
            {signLine}
          </p>
          {reducedMotion || !mounted ? (
            <>
              <p className="mt-3 text-lg leading-relaxed text-cream">{view === "daily" ? h.theme : w.theme}</p>
              <p className="mt-3 leading-relaxed text-cream/85">{view === "daily" ? h.reflection : w.reflection}</p>
            </>
          ) : (
            <AnimatedContent trigger="mount" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2} stagger={0.08}>
              <p className="mt-3 text-lg leading-relaxed text-cream">{view === "daily" ? h.theme : w.theme}</p>
              <p className="mt-3 leading-relaxed text-cream/85">{view === "daily" ? h.reflection : w.reflection}</p>
            </AnimatedContent>
          )}
          <p className="mt-3 text-sm text-cream/75">
            Want transits computed from your own chart?{" "}
            <Link href="/charts" className="font-semibold text-goldbright underline">
              Cast a Western chart
            </Link>{" "}
            and open Today&apos;s transits to this chart under the wheel. That view uses real
            planetary positions matched to your natal planets; this page does not.
          </p>
          <Link href="/spreads/quick-insight" className="btn-gold mt-4 inline-block rounded-xl px-6 py-3 font-bold">
            Ask a personal reading about this
          </Link>
        </article>
      )}
    </div>
  );
}

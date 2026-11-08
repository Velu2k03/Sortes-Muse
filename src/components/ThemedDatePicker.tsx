"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import AnimatedContent from "@/components/AnimatedContent";

/**
 * Themed date picker for /charts. It draws the calendar popup in
 * Sortes tokens: panel background, cream text, gold selected day,
 * Tabler calendar icon, and the same tokens in light mode (panel
 * flips to white, gold flips to dark gold, cream flips to ink text).
 * Transform and opacity only, so it stays calm, and it renders
 * nothing animated when the user prefers reduced motion (the global
 * CSS kills the animation). Value stays YYYY-MM-DD, the same string
 * ChartsClient already sends to /api/chart/calculate, so no chart
 * math, pricing, or privacy
 * behaviour changes. Keyboard: the field is a real button, Escape
 * closes, day buttons are real buttons with full date labels.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseDate(value: string): { y: number; m: number; d: number } | null {
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function formatDisplay(value: string): string {
  const p = parseDate(value);
  if (!p) return "Select a date";
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  return `${mm}/${dd}/${p.y}`;
}

function toValue(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * AF-047: typed dates, so reaching 1990 does not take ~430 month
 * clicks. Accepts MM/DD/YYYY (or MM-DD-YYYY) and YYYY-MM-DD; returns
 * the YYYY-MM-DD value or null when the text is not a real calendar
 * date. Two-digit years are rejected on purpose: "90" is ambiguous.
 */
export function parseTypedDate(input: string): string | null {
  const text = input.trim();
  const mdy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy) {
    const m = Number(mdy[1]);
    const d = Number(mdy[2]);
    const y = Number(mdy[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
    const days = new Date(y, m, 0).getDate();
    if (d > days) return null;
    return toValue(y, m, d);
  }
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const days = new Date(y, m, 0).getDate();
    if (d > days) return null;
    return toValue(y, m, d);
  }
  return null;
}

export default function ThemedDatePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const parsed = parseDate(value);
  const [viewYear, setViewYear] = useState(parsed ? parsed.y : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.m : today.getMonth() + 1);
  // AF-047: typed date, kept as text while the popup is open.
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const openPicker = () => {
    const p = parseDate(value);
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.m);
    } else {
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth() + 1);
    }
    // AF-047: the typed field starts from the current value, so
    // editing a date is editing text, not starting over.
    setTyped(value ? formatDisplay(value) : "");
    setTypedError(null);
    setOpen((o) => !o);
  };

  // AF-047: Enter or leaving the typed field applies a valid date.
  const applyTyped = () => {
    if (!typed.trim()) {
      setTypedError(null);
      return;
    }
    const v = parseTypedDate(typed);
    if (!v) {
      setTypedError("Use MM/DD/YYYY, e.g. 03/14/1990.");
      return;
    }
    setTypedError(null);
    onChange(v);
    setOpen(false);
  };

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  // Grid: start on Sunday, 6 rows of 7, including the trailing days
  // of the previous and next months, muted, exactly like the popup
  // in the user's screenshot (Su first, other-month days shown).
  const first = new Date(viewYear, viewMonth - 1, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth - 1, 0).getDate();
  const cells: { y: number; m: number; d: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const dayIndex = i - startOffset + 1;
    if (dayIndex < 1) {
      const pm = viewMonth === 1 ? 12 : viewMonth - 1;
      const py = viewMonth === 1 ? viewYear - 1 : viewYear;
      cells.push({ y: py, m: pm, d: daysInPrev + dayIndex, inMonth: false });
    } else if (dayIndex > daysInMonth) {
      const nm = viewMonth === 12 ? 1 : viewMonth + 1;
      const ny = viewMonth === 12 ? viewYear + 1 : viewYear;
      cells.push({ y: ny, m: nm, d: dayIndex - daysInMonth, inMonth: false });
    } else {
      cells.push({ y: viewYear, m: viewMonth, d: dayIndex, inMonth: true });
    }
  }

  const todayValue = toValue(today.getFullYear(), today.getMonth() + 1, today.getDate());

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={openPicker}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="num flex w-full items-center justify-between gap-3 rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-left text-base text-cream focus:border-gold/60 focus:outline-none"
      >
        <span className={value ? "" : "text-mist"}>{formatDisplay(value)}</span>
        <Icon name="calendar" size={20} className="shrink-0 text-goldbright" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose a birth date"
          className="calendar-pop absolute left-0 top-full z-30 mt-2 w-[300px] max-w-[calc(100vw-3rem)] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-gold/40 bg-panel p-4 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-full border border-gold/40 p-3 text-goldbright hover:bg-gold/15"
            >
              <Icon name="chevronLeft" size={18} />
            </button>
            {/* AF-047: month + year jump. The year select runs
                1900 to this year, so 1990 is one tap, not ~430
                month clicks. */}
            <div className="flex min-w-0 items-center gap-2">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                aria-label="Month"
                className="num min-w-0 rounded-lg border border-gold/25 bg-panel px-2 py-2 text-sm font-semibold text-cream focus:border-gold/60 focus:outline-none"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                aria-label="Year"
                className="num min-w-0 rounded-lg border border-gold/25 bg-panel px-2 py-2 text-sm font-semibold text-cream focus:border-gold/60 focus:outline-none"
              >
                {Array.from(
                  { length: today.getFullYear() - 1900 + 1 },
                  (_, i) => today.getFullYear() - i,
                ).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-full border border-gold/40 p-3 text-goldbright hover:bg-gold/15"
            >
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-mist">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          {/* The key remounts the fade when the month changes, so
              paging months fades the new grid in. The weekday row
              above stays static. */}
          <AnimatedContent key={`${viewYear}-${viewMonth}`} trigger="mount" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2}>
            <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((c) => {
              const v = toValue(c.y, c.m, c.d);
              const selected = v === value;
              const isToday = v === todayValue;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  aria-label={`${MONTHS[c.m - 1]} ${c.d}, ${c.y}`}
                  aria-pressed={selected}
                  className={`num rounded-lg py-2 text-sm ${
                    selected
                      ? "btn-gold font-bold"
                      : isToday
                        ? "border border-gold/70 font-bold text-goldbright"
                        : c.inMonth
                          ? "text-cream hover:bg-gold/15"
                          : "text-mist hover:bg-gold/10"
                  }`}
                >
                  {c.d}
                </button>
              );
            })}
            </div>
          </AnimatedContent>
          <div className="mt-3 flex items-center justify-between border-t border-gold/20 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-sm font-semibold text-goldbright hover:underline"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(todayValue);
                setOpen(false);
              }}
              className="text-sm font-semibold text-goldbright hover:underline"
            >
              Today
            </button>
          </div>
          {/* AF-047: type the date instead of paging to it. Enter or
              leaving the field applies a valid MM/DD/YYYY. */}
          <div className="mt-3 border-t border-gold/20 pt-3">
            <label htmlFor={`${id}-typed`} className="mb-1.5 block text-xs font-semibold text-mist">
              Or type a date
            </label>
            <input
              id={`${id}-typed`}
              type="text"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setTypedError(null);
              }}
              onBlur={applyTyped}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyTyped();
                }
              }}
              placeholder="MM/DD/YYYY"
              inputMode="numeric"
              className="num w-full rounded-xl border border-gold/25 bg-panel/70 px-3 py-2 text-sm text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
            />
            {typedError && (
              <p className="mt-1 text-xs text-danger">{typedError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

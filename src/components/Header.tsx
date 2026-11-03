"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CountUp from "@/components/CountUp";
import Icon, { type IconName } from "@/components/Icon";
import { APP_SHORT } from "@/lib/site";

// Phase F: every nav entry carries a one-line plain description. The
// desktop bar shows the label with the description as a hover title;
// the mobile menu shows the description under the label, so a
// first-time user never has to guess what a section does.
const NAV: { href: string; label: string; icon: IconName; desc: string }[] = [
  { href: "/", label: "Home", icon: "home", desc: "Start here: daily card, spreads, and charts" },
  { href: "/deck", label: "Deck", icon: "deck", desc: "All 78 cards, upright and reversed" },
  { href: "/daily", label: "Daily Card", icon: "sparkle", desc: "Your free card of the day" },
  { href: "/spreads", label: "Readings", icon: "search", desc: "Tarot spreads for a question" },
  { href: "/charts", label: "Charts", icon: "chart", desc: "Birth charts: Western, Vedic, Ziwei" },
  { href: "/reports", label: "Reports", icon: "briefcase", desc: "Keep-forever reports, 1 Oracle each" },
  { href: "/horoscope", label: "Horoscope", icon: "globe", desc: "Daily and weekly reflections, free" },
  { href: "/guides", label: "Guides", icon: "iconoirBook", desc: "How tarot and charts work" },
  { href: "/history", label: "Journal", icon: "lock", desc: "Your past readings and notes" },
];

// Footer-only sections, listed in the mobile menu (a vertical list has
// room; the desktop bar stays at nine items so it does not wrap).
const MOBILE_NAV: { href: string; label: string; icon: IconName; desc: string }[] = [
  ...NAV,
  { href: "/birth-card", label: "Birth Card", icon: "calendar", desc: "One Major Arcana card from your birth date" },
  { href: "/faq", label: "FAQ", icon: "info", desc: "Common questions, answered" },
];

export default function Header() {
  const { credits, user, loading } = useAuth();
  const pathname = usePathname();
  // Phase F: the current section is marked, on desktop and mobile, so
  // a user always knows where they are. Deep pages highlight their
  // parent section: a reading detail highlights Journal, an intake or
  // spread flow highlights Readings, a report detail highlights Reports.
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/spreads" && (pathname.startsWith("/spreads/") || pathname.startsWith("/intake/"))) return true;
    if (href === "/history" && pathname.startsWith("/reading/")) return true;
    if (href === "/reports" && pathname.startsWith("/reports/")) return true;
    if (href === "/guides" && pathname.startsWith("/guides/")) return true;
    return false;
  };
  const [open, setOpen] = useState(false);
  // Theme default is light, persisted in
  // localStorage under sortes-theme, layout's inline script already
  // set data-theme before paint so there is no light flash. The toggle
  // here only flips the stored value and the attribute, and tells the
  // theme-aware Western wheel to re-render via a window event.
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sortes-theme");
      if (saved === "light" || saved === "dark") queueMicrotask(() => setTheme(saved));
    } catch {
      // Private mode or blocked storage: stay light, do not crash.
    }
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("sortes-theme", next);
    } catch {
      // Storage blocked: theme still flips for this session.
    }
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event("sortes-theme-change"));
  };
  const initial = user?.email ? user.email.charAt(0).toUpperCase() : "?";

  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Header crowding fix: desktop nav only at lg and up, so the
            7-item nav plus credit pill, Top up, and Sign in do not
            collide or wrap at tablet widths (768-1024px). Below lg the
            hamburger menu carries all nav items. Logo is smaller at
            small widths to keep it clear of the first nav item. */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/brand/logo.webp"
            alt=""
            width={36}
            height={36}
            className="rounded-lg logo-turn-once"
          />
          <span className="font-display text-xl tracking-wide text-goldbright sm:text-2xl">
            {APP_SHORT}
          </span>
        </Link>

        <nav className="hidden items-center gap-4 lg:flex" aria-label="Primary">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.desc}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "text-sm font-semibold text-goldbright"
                    : "text-sm text-cream/80 transition hover:text-goldbright"
                }
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            className="rounded-lg p-2 text-cream/80 transition hover:text-goldbright"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
          </button>
          <Link
            href="/credits"
            className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-sm font-semibold text-goldbright"
            aria-label={`Oracle balance: ${credits ?? 0} Oracles`}
            title="Your Oracles"
          >
            <Icon name="coin" size={18} />
            <span className="num">
              <CountUp value={credits ?? 0} />
            </span>
            <span>Oracles</span>
          </Link>
          <Link
            href="/credits"
            className="btn-gold hidden rounded-full px-4 py-1.5 text-sm font-bold lg:inline-block"
          >
            Top up
          </Link>
          {!loading &&
            (user ? (
              <Link
                href="/account"
                title={user.email}
                aria-label={`Account: ${user.email}`}
                className="hidden h-8 w-8 items-center justify-center rounded-full border border-gold/50 bg-gold/15 font-display text-sm font-bold text-goldbright transition hover:border-goldbright lg:flex"
              >
                {initial}
              </Link>
            ) : (
              <Link
                href="/account"
                className="hidden rounded-full px-4 py-1.5 text-sm font-semibold text-cream/80 transition hover:text-goldbright lg:inline-block"
              >
                Sign in
              </Link>
            ))}
          <button
            type="button"
            className="rounded-lg p-2 text-cream/80 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <Icon name={open ? "close" : "menu"} size={22} />
          </button>
        </div>
      </div>

      {open && (
        <nav
          className="border-t border-gold/15 bg-ink/95 px-4 py-3 lg:hidden"
          aria-label="Mobile"
        >
          {MOBILE_NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-gold/10"
              >
                <span className="mt-0.5 shrink-0">
                  <Icon name={n.icon} size={20} />
                </span>
                <span>
                  <span
                    className={`block text-base ${active ? "font-semibold text-goldbright" : "text-cream/90"}`}
                  >
                    {n.label}
                  </span>
                  <span className="block text-xs text-mist">{n.desc}</span>
                </span>
              </Link>
            );
          })}
          <Link
            href="/credits"
            onClick={() => setOpen(false)}
            className="btn-gold mt-2 block rounded-xl px-3 py-2.5 text-center text-base font-bold"
          >
            Top up Oracles
          </Link>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-xl border border-gold/30 px-3 py-2.5 text-center text-base font-semibold text-cream/90 hover:bg-gold/10"
          >
            {user ? `Account · ${user.email}` : "Sign in"}
          </Link>
        </nav>
      )}
    </header>
  );
}

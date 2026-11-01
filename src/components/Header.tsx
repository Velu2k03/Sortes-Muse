"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CountUp from "@/components/CountUp";
import Icon, { type IconName } from "@/components/Icon";
import { APP_SHORT } from "@/lib/site";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/deck", label: "Deck", icon: "deck" },
  { href: "/daily", label: "Daily Card", icon: "sparkle" },
  { href: "/spreads", label: "Readings", icon: "journal" },
  { href: "/charts", label: "Charts", icon: "chart" },
  { href: "/horoscope", label: "Horoscope", icon: "star" },
  { href: "/history", label: "Journal", icon: "journal" },
];

export default function Header() {
  const { credits, user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  // Light theme, Expansion 1: default dark gold, persisted in
  // localStorage under sortes-theme, layout's inline script already
  // set data-theme before paint so there is no dark flash. The toggle
  // here only flips the stored value and the attribute, and tells the
  // theme-aware Western wheel to re-render via a window event.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sortes-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // Private mode or blocked storage: stay dark, do not crash.
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
            className="rounded-lg"
          />
          <span className="font-display text-xl tracking-wide text-goldbright sm:text-2xl">
            {APP_SHORT}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-sm text-cream/80 transition hover:text-goldbright"
            >
              {n.label}
            </Link>
          ))}
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
            className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-goldbright"
            aria-label={`Credit balance: ${credits ?? 0} readings`}
            title="Your reading credits"
          >
            <Icon name="coin" size={18} />
            <span>
              <CountUp value={credits ?? 0} />
            </span>
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
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-cream/90 hover:bg-gold/10"
            >
              <Icon name={n.icon} size={20} />
              {n.label}
            </Link>
          ))}
          <Link
            href="/credits"
            onClick={() => setOpen(false)}
            className="btn-gold mt-2 block rounded-xl px-3 py-2.5 text-center text-base font-bold"
          >
            Top up credits
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

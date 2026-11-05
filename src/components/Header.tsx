"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CountUp from "@/components/CountUp";
import Icon, { type IconName } from "@/components/Icon";
import BranchedMenu, { type BranchedMenuItem } from "@/components/BranchedMenu";
import { APP_SHORT } from "@/lib/site";

// Header grouping, 2026-11-05: the desktop bar shows four groups
// (Tarot, Astrology, Learn, Journal) instead of nine links plus a
// More menu. Tapping a group opens one React Bits BranchedMenu panel
// with every destination in that group, the current page traced by
// the branch line. Home stays on the logo, Oracles stays as the pill
// plus Top up, and Sign in stays where it was, so buying is never
// hidden behind a menu. The same BranchedMenu is the mobile menu.
// About and Methodology live in Learn; they were footer-only before.
const GROUPS: BranchedMenuItem[] = [
  { label: "Home", value: "/" },
  {
    label: "Tarot",
    children: [
      { value: "/daily", label: "Daily Card" },
      { value: "/spreads", label: "Spreads" },
      { value: "/deck", label: "Deck" },
      { value: "/birth-card", label: "Birth Card" },
    ],
  },
  {
    label: "Astrology",
    children: [
      { value: "/charts", label: "Charts" },
      { value: "/reports", label: "Reports" },
      { value: "/horoscope", label: "Horoscope" },
    ],
  },
  {
    label: "Learn",
    children: [
      { value: "/guides", label: "Guides" },
      { value: "/faq", label: "FAQ" },
      { value: "/about", label: "About Sortes" },
      { value: "/methodology", label: "Methodology" },
    ],
  },
  { label: "Journal", value: "/history" },
];

// Desktop bar group buttons open the panel with that section open.
// Journal is a leaf, so its bar button is a plain link.
const BAR_GROUPS = [
  { label: "Tarot", index: 1 },
  { label: "Astrology", index: 2 },
  { label: "Learn", index: 3 },
];

const ALL_HREFS = ["/", "/daily", "/spreads", "/deck", "/birth-card", "/charts", "/reports", "/horoscope", "/guides", "/faq", "/about", "/methodology", "/history"];

export default function Header() {
  const { credits, user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // Deep pages highlight their parent section: a reading detail
  // highlights Journal, an intake or spread flow highlights
  // Spreads, a report detail highlights Reports.
  const activeHref = (() => {
    if (pathname.startsWith("/spreads/") || pathname.startsWith("/intake/")) return "/spreads";
    if (pathname.startsWith("/reading/")) return "/history";
    if (pathname.startsWith("/reports/")) return "/reports";
    if (pathname.startsWith("/guides/")) return "/guides";
    return ALL_HREFS.includes(pathname) ? pathname : "/";
  })();
  const [panel, setPanel] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
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
  // BranchedMenu colours are theme-aware: the panel background is
  // bg-navydeep, which is dark navy in dark theme and light cream in
  // light theme, so hardcoded dark-theme ink fails axe in light
  // theme. The muted branch colour is overridden in globals.css
  // (.sortes-bm), since the component fixes it at 55% internally.
  const bmColor = theme === "dark" ? "#ede6d6" : "#3a3325";
  const bmAccent = theme === "dark" ? "#d4af37" : "#7c5e00";
  const bmLine = theme === "dark" ? "rgba(212, 175, 55, 0.45)" : "rgba(124, 94, 0, 0.45)";
  const go = (value: string) => {
    setPanel(null);
    setMobileOpen(false);
    router.push(value);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-ink/85 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
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
          {BAR_GROUPS.map((g) => (
            <button
              key={g.label}
              type="button"
              onClick={() => setPanel((v) => (v === g.index ? null : g.index))}
              onKeyDown={(e) => { if (e.key === "Escape") setPanel(null); }}
              aria-expanded={panel === g.index}
              aria-haspopup="true"
              className={panel === g.index ? "text-sm font-semibold text-goldbright" : "text-sm text-cream/80 transition hover:text-goldbright"}
            >
              {g.label}
            </button>
          ))}
          <Link
            href="/history"
            aria-current={activeHref === "/history" ? "page" : undefined}
            className={activeHref === "/history" ? "text-sm font-semibold text-goldbright" : "text-sm text-cream/80 transition hover:text-goldbright"}
          >
            Journal
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            className="rounded-lg p-3 text-cream/80 transition hover:text-goldbright"
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
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-gold/15 font-display text-sm font-bold text-goldbright transition hover:border-goldbright lg:flex"
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
            className="rounded-lg p-3 text-cream/80 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <Icon name={mobileOpen ? "close" : "menu"} size={22} />
          </button>
        </div>

        {panel !== null && (
          <div
            className="absolute right-4 top-full z-50 mt-2 hidden w-[300px] rounded-2xl border border-gold/25 bg-navydeep p-4 shadow-2xl lg:block sm:right-6"
            onKeyDown={(e) => { if (e.key === "Escape") setPanel(null); }}
          >
            <BranchedMenu
              key={`desktop-${panel}-${activeHref}`}
              items={GROUPS}
              defaultOpen={panel}
              defaultActive={activeHref}
              onSelect={(value) => go(value)}
              color={bmColor}
              accentColor={bmAccent}
              lineColor={bmLine}
              width={260}
              className="sortes-bm"
            />
          </div>
        )}
      </div>

      {panel !== null && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          className="fixed inset-0 z-30 hidden cursor-default bg-transparent lg:block"
          onClick={() => setPanel(null)}
        />
      )}

      {mobileOpen && (
        <nav
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-gold/15 bg-ink/95 px-4 py-3 lg:hidden"
          aria-label="Mobile"
        >
          <BranchedMenu
            key={`mobile-${activeHref}`}
            items={GROUPS}
            defaultOpen={[1, 2, 3]}
            defaultActive={activeHref}
            onSelect={(value) => go(value)}
            color={bmColor}
            accentColor={bmAccent}
            lineColor={bmLine}
            width={320}
            className="sortes-bm"
          />
          <Link
            href="/credits"
            onClick={() => setMobileOpen(false)}
            className="btn-gold mt-3 block rounded-xl px-3 py-2.5 text-center text-base font-bold"
          >
            Top up Oracles
          </Link>
          <Link
            href="/account"
            onClick={() => setMobileOpen(false)}
            className="mt-2 block rounded-xl border border-gold/30 px-3 py-2.5 text-center text-base font-semibold text-cream/90 hover:bg-gold/10"
          >
            {user ? `Account · ${user.email}` : "Sign in"}
          </Link>
        </nav>
      )}
    </header>
  );
}

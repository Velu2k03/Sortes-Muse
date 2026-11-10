"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth, deviceHeldSession } from "@/components/AuthProvider";
import { freeReadingUsed } from "@/lib/storage";
import { isFreeAvailableFor } from "@/lib/free-reading";
import CountUp from "@/components/CountUp";
import Icon from "@/components/Icon";
import BranchedMenu, { type BranchedMenuItem } from "@/components/BranchedMenu";
import { APP_SHORT } from "@/lib/site";

// Header grouping, 2026-11-05: the desktop bar shows four groups
// (Tarot, Astrology, Learn, Journal) instead of nine links plus a
// More menu. Home stays on the logo, Oracles stays as one pill, and
// Sign in stays where it was, so buying is never hidden behind a
// menu. About and Methodology live in Learn; they were footer-only
// before.
//
// Phase 4A (4.1): each desktop group opens a small popover anchored
// directly below the item that was clicked, showing ONLY that
// group's links. The old BranchedMenu teleport opened one panel on
// the far right no matter which group was clicked. BranchedMenu
// stays for the mobile drawer only. Keyboard: ArrowDown opens a
// group and moves into it, ArrowUp/Down cycle its links, Escape
// closes and returns focus to the trigger, Tab closes the menu.
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
  { label: "Journal", value: "/journal" },
];

// Desktop bar group buttons open the anchored popover for that
// group. Journal is a leaf, so its bar button is a plain link.
const BAR_GROUPS = [
  { label: "Tarot", index: 1 },
  { label: "Astrology", index: 2 },
  { label: "Learn", index: 3 },
];

const ALL_HREFS = ["/", "/daily", "/spreads", "/deck", "/birth-card", "/charts", "/reports", "/horoscope", "/guides", "/faq", "/about", "/methodology", "/journal"];

// Theme-color per active theme, kept in step with data-theme by
// theme.js (before paint) and the Header toggle (on change).
const THEME_COLORS = { dark: "#0a0e1a", light: "#fdf9ee" } as const;
function syncThemeColor(theme: "dark" | "light"): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

export default function Header() {
  const { credits, user, loadError, refresh, freeReadingAvailable, authFailed } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // Deep pages highlight their parent section: a reading detail
  // highlights Journal, an intake or spread flow highlights
  // Spreads, a report detail highlights Reports.
  const activeHref = (() => {
    if (pathname.startsWith("/spreads/") || pathname.startsWith("/intake/")) return "/spreads";
    if (pathname.startsWith("/reading/")) return "/journal";
    if (pathname.startsWith("/reports/")) return "/reports";
    if (pathname.startsWith("/guides/")) return "/guides";
    if (pathname.startsWith("/deck/")) return "/deck";
    return ALL_HREFS.includes(pathname) ? pathname : "/";
  })();
  // Index into GROUPS of the open desktop popover, or null.
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  // AF-014: a guest with 0 Oracles and an unused free reading sees
  // "1 free reading" in the pill instead of "0 Oracles". The device
  // flags are read on mount and whenever the tab regains focus or the
  // wallet changes, so using the free reading elsewhere updates the
  // pill. Batch 1 (C1): the pill goes through isFreeAvailableFor,
  // never the raw device flag, so a signed-in user whose /me failed
  // (user null, credits 0 after migration) does not see "Free" from
  // a device flag that was never used on this device.
  const [deviceFree, setDeviceFree] = useState(false);
  const [hadSession, setHadSession] = useState(false);
  useEffect(() => {
    const syncFree = () => {
      try {
        setDeviceFree(!freeReadingUsed());
        setHadSession(deviceHeldSession());
      } catch {
        setDeviceFree(false);
        setHadSession(false);
      }
    };
    syncFree();
    window.addEventListener("focus", syncFree);
    window.addEventListener("sortes:credits-changed", syncFree);
    return () => {
      window.removeEventListener("focus", syncFree);
      window.removeEventListener("sortes:credits-changed", syncFree);
    };
  }, []);
  const freeAvailable = isFreeAvailableFor({
    slug: "quick-insight",
    signedIn: !!user,
    serverFree: freeReadingAvailable,
    deviceFree,
    hadSession,
    authFailed,
  });
  // AF-038: an open desktop dropdown closes on scroll, so it never
  // covers the page while the visitor reads on.
  useEffect(() => {
    if (openGroup === null) return;
    const onScroll = () => setOpenGroup(null);
    window.addEventListener("scroll", onScroll, { capture: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [openGroup]);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  // ArrowDown on a trigger opens the group and moves focus into it;
  // the effect below runs once the menu exists in the DOM.
  const focusFirstOnOpen = useRef(false);
  useEffect(() => {
    if (openGroup !== null && focusFirstOnOpen.current) {
      focusFirstOnOpen.current = false;
      itemRefs.current[0]?.focus();
    }
  }, [openGroup]);

  const closeMenu = (returnFocus: boolean) => {
    const index = openGroup;
    setOpenGroup(null);
    if (returnFocus && index !== null) {
      triggerRefs.current[index]?.focus();
    }
  };
  const openMenu = (index: number, focusFirst: boolean) => {
    focusFirstOnOpen.current = focusFirst;
    itemRefs.current = [];
    setOpenGroup((v) => (v === index ? null : index));
  };
  // Theme: a saved choice persists in
  // localStorage under sortes-theme; with no saved choice the OS
  // prefers-color-scheme decides (AF-031), and layout's inline
  // script already set data-theme before paint so there is no
  // flash. The toggle here only flips the stored value and the
  // attribute, and tells the theme-aware Western wheel to re-render
  // via a window event.
  // Phase 2, 2.5: the toggle also keeps the meta theme-color in step
  // with the active theme (dark #0a0e1a, light #fdf9ee), so the
  // browser chrome matches the page; theme.js does the same before
  // paint for first load.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sortes-theme");
      if (saved === "light" || saved === "dark") {
        queueMicrotask(() => {
          setTheme(saved);
          syncThemeColor(saved);
        });
        return;
      }
      // AF-031: no saved choice — follow the OS, and keep following
      // it until the user picks a theme. toggleTheme stores a choice,
      // and the guard in applyOs then stops OS changes overriding it.
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const applyOs = () => {
        if (localStorage.getItem("sortes-theme")) return;
        const os: "dark" | "light" = mq.matches ? "light" : "dark";
        setTheme(os);
        document.documentElement.dataset.theme = os;
        syncThemeColor(os);
      };
      applyOs();
      mq.addEventListener("change", applyOs);
      return () => mq.removeEventListener("change", applyOs);
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
    syncThemeColor(next);
    window.dispatchEvent(new Event("sortes-theme-change"));
  };
  const initial = user?.email ? user.email.charAt(0).toUpperCase() : "?";
  // AF-014: signed-out, 0 Oracles, free reading still unused.
  const showFreePill = !user && credits === 0 && freeAvailable;
  // BranchedMenu colours are theme-aware: the panel background is
  // bg-navydeep, which is dark navy in dark theme and light cream in
  // light theme, so hardcoded dark-theme ink fails axe in light
  // theme. The muted branch colour is overridden in globals.css
  // (.sortes-bm), since the component fixes it at 55% internally.
  // Still used by the mobile drawer, the only BranchedMenu left.
  const bmColor = theme === "dark" ? "#ede6d6" : "#3a3325";
  const bmAccent = theme === "dark" ? "#d4af37" : "#7c5e00";
  const bmLine = theme === "dark" ? "rgba(212, 175, 55, 0.45)" : "rgba(124, 94, 0, 0.45)";
  const go = (value: string) => {
    setOpenGroup(null);
    setMobileOpen(false);
    router.push(value);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-ink/85 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 py-1.5">
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

        {/* AF-038: the nav sits above the fixed click-away overlay
            below (z-30), so clicking another group switches to it
            directly instead of the overlay swallowing the tap and
            only closing the open menu. */}
        <nav className="relative z-40 hidden items-center gap-4 lg:flex" aria-label="Primary">
          {BAR_GROUPS.map((g) => {
            const group = GROUPS[g.index];
            const children = group.children ?? [];
            const isOpen = openGroup === g.index;
            const isActive = children.some((kid) => kid.value === activeHref);
            return (
              <div key={g.label} className="relative">
                <button
                  ref={(el) => {
                    triggerRefs.current[g.index] = el;
                  }}
                  type="button"
                  onClick={() => openMenu(g.index, false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeMenu(true);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      openMenu(g.index, true);
                    }
                  }}
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  aria-controls={`nav-menu-${g.label.toLowerCase()}`}
                  className={isOpen || isActive ? "text-sm font-semibold text-goldbright" : "text-sm text-cream/80 transition hover:text-goldbright"}
                >
                  {g.label}
                </button>
                {isOpen && (
                  <div
                    id={`nav-menu-${g.label.toLowerCase()}`}
                    role="menu"
                    tabIndex={-1}
                    aria-label={g.label}
                    className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-gold/25 bg-navydeep p-2 shadow-2xl"
                    onKeyDown={(e) => {
                      const items = itemRefs.current;
                      const current = items.indexOf(document.activeElement as HTMLAnchorElement);
                      if (e.key === "Escape") {
                        e.preventDefault();
                        closeMenu(true);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        items[(current + 1) % items.length]?.focus();
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        items[(current - 1 + items.length) % items.length]?.focus();
                      } else if (e.key === "Home") {
                        e.preventDefault();
                        items[0]?.focus();
                      } else if (e.key === "End") {
                        e.preventDefault();
                        items[items.length - 1]?.focus();
                      } else if (e.key === "Tab") {
                        setOpenGroup(null);
                      }
                    }}
                  >
                    {children.map((kid, i) => (
                      <Link
                        key={kid.value}
                        ref={(el) => {
                          itemRefs.current[i] = el;
                        }}
                        href={kid.value}
                        role="menuitem"
                        aria-current={activeHref === kid.value ? "page" : undefined}
                        onClick={() => setOpenGroup(null)}
                        className={`block rounded-xl px-3 py-2.5 text-sm transition hover:bg-gold/10 hover:text-goldbright ${
                          activeHref === kid.value ? "font-semibold text-goldbright" : "text-cream/85"
                        }`}
                      >
                        {kid.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <Link
            href="/journal"
            aria-current={activeHref === "/journal" ? "page" : undefined}
            className={activeHref === "/journal" ? "text-sm font-semibold text-goldbright" : "text-sm text-cream/80 transition hover:text-goldbright"}
          >
            Journal
          </Link>
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            className="rounded-lg p-3 text-cream/80 transition hover:text-goldbright"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
          </button>
          {/* Phase 4A (4.1): one Oracle pill, not two controls. The
              balance and the Top up action are a single link to
              /oracles; the separate Top up button is gone.
              P0-1: while credits is null the balance is unknown, so
              the pill shows a skeleton, never 0, and the aria-label
              says loading instead of "0 Oracles".
              AF-014: a signed-out visitor with 0 Oracles and an
              unused free reading sees "1 free reading" and the pill
              goes to the free Quick Insight, not the top-up page. */}
          <Link
            href={showFreePill ? "/spreads/quick-insight" : "/oracles"}
            className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-2.5 text-sm font-semibold text-goldbright"
            aria-label={
              credits === null
                ? "Oracle balance loading. Top up."
                : showFreePill
                  ? "1 free reading available. Start your free Quick Insight reading."
                  : `Oracle balance: ${credits} Oracles. Top up.`
            }
            title={showFreePill ? "Your first Quick Insight reading is free" : "Your Oracles — top up"}
          >
            <Icon name="coin" size={18} />
            {credits === null ? (
              <span className="inline-block h-4 w-6 animate-pulse rounded bg-gold/30" aria-hidden="true" />
            ) : showFreePill ? (
              <span>1 free reading</span>
            ) : (
              <span className="num">
                <CountUp value={credits} />
              </span>
            )}
            {/* Phase 6 (D3): the word "Oracles" hides below 420px so the
                header row fits at 390px. The coin + count stay, and the
                aria-label still reads the full balance. The buttons
                keep p-3 (44px touch targets, asserted by charts-check)
                — the pill is the flexible part, not the buttons. */}
            {!showFreePill && (
              <>
                <span className="hidden min-[420px]:inline">Oracles</span>
                <span className="hidden border-l border-gold/40 pl-1.5 sm:inline">Get Oracles</span>
              </>
            )}
          </Link>
          {loadError && (
            <button
              type="button"
              onClick={() => void refresh()}
              aria-label="Retry loading your account"
              title="Couldn't load your account — retry"
              className="rounded-full border border-gold/40 bg-gold/10 px-3 py-3 text-sm font-semibold text-goldbright transition hover:border-goldbright"
            >
              Retry
            </button>
          )}
          {/* AF-012: the Sign in link renders whenever there is no
              signed-in user, including while the session is still
              loading, so it is in the server HTML instead of only
              appearing after hydration. A signed-in visitor briefly
              sees it until the session resolves to their avatar. */}
          {user ? (
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
          )}
          <button
            type="button"
            className="rounded-lg p-3 text-cream/80 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            <Icon name={mobileOpen ? "close" : "menu"} size={22} />
          </button>
        </div>
      </div>

      {openGroup !== null && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          className="fixed inset-0 z-30 hidden cursor-default bg-transparent lg:block"
          onClick={() => closeMenu(false)}
        />
      )}

      {mobileOpen && (
        <nav
          id="mobile-nav"
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
            href="/oracles"
            onClick={() => setMobileOpen(false)}
            className="btn-gold mt-3 block rounded-xl px-3 py-2.5 text-center text-base font-bold"
          >
            Get Oracles
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

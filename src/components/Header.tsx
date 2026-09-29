"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { APP_SHORT } from "@/lib/site";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/deck", label: "Deck" },
  { href: "/daily", label: "Daily Card" },
  { href: "/spreads", label: "Readings" },
  { href: "/history", label: "Journal" },
];

export default function Header() {
  const { credits, user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const initial = user?.email ? user.email.charAt(0).toUpperCase() : "?";

  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/brand/logo.webp"
            alt=""
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="font-display text-2xl tracking-wide text-goldbright">
            {APP_SHORT}
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
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

        <div className="flex items-center gap-3">
          <Link
            href="/credits"
            className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-goldbright"
            aria-label={`Credit balance: ${credits ?? 0} readings`}
            title="Your reading credits"
          >
            <span aria-hidden="true">✦</span>
            <span>{credits ?? 0}</span>
          </Link>
          <Link
            href="/credits"
            className="btn-gold hidden rounded-full px-4 py-1.5 text-sm font-bold sm:inline-block"
          >
            Top up
          </Link>
          {!loading &&
            (user ? (
              <Link
                href="/account"
                title={user.email}
                aria-label={`Account: ${user.email}`}
                className="hidden h-8 w-8 items-center justify-center rounded-full border border-gold/50 bg-gold/15 font-display text-sm font-bold text-goldbright transition hover:border-goldbright sm:flex"
              >
                {initial}
              </Link>
            ) : (
              <Link
                href="/account"
                className="hidden rounded-full px-4 py-1.5 text-sm font-semibold text-cream/80 transition hover:text-goldbright sm:inline-block"
              >
                Sign in
              </Link>
            ))}
          <button
            type="button"
            className="rounded-lg p-2 text-cream/80 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav
          className="border-t border-gold/15 bg-ink/95 px-4 py-3 md:hidden"
          aria-label="Mobile"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-base text-cream/90 hover:bg-gold/10"
            >
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

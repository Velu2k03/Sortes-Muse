import type { Metadata } from "next";
import Link from "next/link";

// Phase 1, 2026-11-04: the not-found page used to carry the home
// title from the layout, which was misleading, and it offered no
// way forward except home. Give it its own title and a short list
// of the places most visitors actually want.
export const metadata: Metadata = {
  title: "Page not found | Sortes",
  description:
    "That Sortes page does not exist. Try a daily card, a reading, the deck, a birth chart, or a guide instead.",
  robots: { index: false, follow: true },
};

const PLACES = [
  { href: "/daily", label: "Daily Card", desc: "Your free card of the day" },
  { href: "/spreads", label: "Readings", desc: "Tarot spreads for a question" },
  { href: "/deck", label: "Deck", desc: "All 78 card meanings" },
  { href: "/charts", label: "Charts", desc: "Western, Vedic, and Ziwei birth charts" },
  { href: "/guides", label: "Guides", desc: "How tarot and charts work" },
  { href: "/faq", label: "FAQ", desc: "Common questions, answered" },
];

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-display text-8xl text-gold/40">✦</p>
      <h1 className="mt-6 font-display text-5xl text-goldbright">
        Lost in the stars
      </h1>
      <p className="mt-4 text-cream/75">
        The page you are looking for drifted out of the spread.
      </p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {PLACES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-2xl border border-gold/25 bg-panel/60 px-4 py-3 text-left hover:border-gold/60"
          >
            <span className="block font-display text-lg text-goldbright">{p.label}</span>
            <span className="block text-sm text-cream/75">{p.desc}</span>
          </Link>
        ))}
      </div>
      <Link
        href="/"
        className="btn-gold mt-8 rounded-xl px-8 py-3 font-bold"
      >
        Return home
      </Link>
    </div>
  );
}

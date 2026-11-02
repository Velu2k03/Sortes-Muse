import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata = {
  title: "Guides",
  description:
    "Short, substantive guides to tarot, spreads, and birth charts, written for Sortes. Reflection, not prediction.",
};

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Guides</p>
      <h1 className="mt-3 font-display text-5xl text-goldbright">
        Guides to tarot and charts
      </h1>
      <p className="mt-4 max-w-xl text-cream/75">
        Short guides that explain what Sortes actually does: the deck, how to
        ask a question, the Celtic Cross, and how tarot differs from a birth
        chart. Written for Sortes, free to read, no account needed.
      </p>
      <div className="mt-10 space-y-4">
        {GUIDES.map((g) => (
          <Link
            key={g.slug}
            href={`/guides/${g.slug}`}
            className="block rounded-3xl border border-gold/25 bg-panel/70 p-6 hover:border-gold/60"
          >
            <h2 className="font-display text-3xl text-goldbright">{g.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-cream/75">
              {g.description}
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-goldbright underline underline-offset-4">
              Read the guide
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-10 text-sm text-mist">
        Want to try it instead of reading about it? Draw a free daily card, or
        browse all 78 card meanings in the deck.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/daily" className="btn-gold">
          Daily Card
        </Link>
        <Link href="/deck" className="btn-secondary">
          Browse the deck
        </Link>
      </div>
    </div>
  );
}

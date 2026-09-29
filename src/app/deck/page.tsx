"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CARDS, MAJORS, cardsBySuit, SUITS, suitLabel } from "@/lib/cards";
import CardModal from "@/components/CardModal";

type Filter = "all" | "major" | "wands" | "cups" | "swords" | "pentacles";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All 78" },
  { key: "major", label: "Major Arcana" },
  { key: "wands", label: "Wands" },
  { key: "cups", label: "Cups" },
  { key: "swords", label: "Swords" },
  { key: "pentacles", label: "Pentacles" },
];

export default function DeckPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const cards = useMemo(() => {
    let list = CARDS;
    if (filter === "major") list = MAJORS;
    else if (filter !== "all") list = cardsBySuit(filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return list;
  }, [filter, query]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">The deck</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          All 78 cards
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          The complete Rider-Waite deck with upright and reversed meanings.
          Free forever. Tap any card to read its story.
        </p>
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards, e.g. moon, strength…"
          aria-label="Search cards"
          className="w-full max-w-md rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/60 focus:border-gold/60 focus:outline-none"
        />
        <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Filter cards">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === f.key
                  ? "bg-gold text-ink"
                  : "border border-gold/30 text-cream/80 hover:border-gold/60 hover:text-goldbright"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-mist" aria-live="polite">
          {cards.length} {cards.length === 1 ? "card" : "cards"}
          {filter !== "all" && filter !== "major" && ` · ${suitLabel(filter)}`}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6">
        {cards.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            onClick={() => setSelected(c.id)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.5), duration: 0.4 }}
            className="group overflow-hidden rounded-xl border border-gold/20 bg-panel/50 transition hover:-translate-y-1 hover:border-gold/60 hover:shadow-[0_12px_30px_rgba(212,175,55,0.15)]"
            aria-label={`View meaning of ${c.name}`}
          >
            <div className="relative aspect-[3/5] w-full">
              <Image
                src={c.image}
                alt={c.name}
                fill
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                className="object-cover"
                loading={i < 12 ? "eager" : "lazy"}
              />
            </div>
            <p className="truncate px-2 py-2 text-xs font-medium text-cream/90 group-hover:text-goldbright">
              {c.name}
            </p>
          </motion.button>
        ))}
      </div>

      {cards.length === 0 && (
        <p className="mt-16 text-center text-mist">
          No cards match your search. Try another name.
        </p>
      )}

      <CardModal cardId={selected} onClose={() => setSelected(null)} />

      <p className="mt-10 text-center text-xs text-mist/70">
        Card imagery: the public-domain Rider-Waite deck (1909). Meanings are
        original to {SUITS.length ? "Sortes" : ""} and written for reflection.
      </p>
    </div>
  );
}

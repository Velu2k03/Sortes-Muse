"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CARDS, MAJORS, cardsBySuit, SUITS, suitLabel } from "@/lib/cards";
import CardModal from "@/components/CardModal";
import InfiniteSpiral from "@/components/InfiniteSpiral";

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
  const [view, setView] = useState<"spiral" | "list">("spiral");
  const [reducedMotion, setReducedMotion] = useState(false);
  // The spiral sets pointer capture on press, so a real tap's click event
  // is retargeted to the spiral root and never lands on a card. Detect
  // taps ourselves on press and release instead, and look the card up
  // from the pointer position, so a tap opens the detail and a drag
  // (moved more than 12px) still only spins the helix.
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const cardId = new URLSearchParams(window.location.search).get("card");
    if (!cardId || !CARDS.some((card) => card.id === cardId)) return;
    const frame = window.requestAnimationFrame(() => setSelected(cardId));
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
          {filter === "all" && !query.trim()
            ? "All 78 cards"
            : `${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          The complete Rider-Waite deck with upright and reversed meanings.
          Free forever. Tap any card to read its story.
        </p>
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <label htmlFor="deck-search" className="mb-1.5 block text-sm font-medium text-cream">
          Search cards
        </label>
        <input
          id="deck-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards, e.g. moon, strength…"
          className="w-full max-w-md rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
        />
        <Link href="/daily" className="text-sm font-semibold text-goldbright underline underline-offset-4">
          Draw today&apos;s card, free
        </Link>
        {/* Validator fix: these are filter toggles, not tabs, and
            there is no tabpanel on the page, so role=tab is wrong.
            aria-pressed says the same thing, correctly. */}
        <div role="group" className="flex flex-wrap justify-center gap-2" aria-label="Filter cards">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
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
        <div role="group" className="flex gap-2" aria-label="Deck view">
          <button
            type="button"
            aria-pressed={view === "spiral" && !reducedMotion}
            onClick={() => setView("spiral")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              view === "spiral" && !reducedMotion
                ? "bg-gold text-ink"
                : "border border-gold/30 text-cream/80 hover:border-gold/60 hover:text-goldbright"
            }`}
          >
            Spiral
          </button>
          <button
            type="button"
            aria-pressed={view === "list" || reducedMotion}
            onClick={() => setView("list")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              view === "list" || reducedMotion
                ? "bg-gold text-ink"
                : "border border-gold/30 text-cream/80 hover:border-gold/60 hover:text-goldbright"
            }`}
          >
            List
          </button>
        </div>
        {reducedMotion && (
          <p className="text-xs text-mist">
            Reduced motion is on, so the deck shows as a list.
          </p>
        )}
      </div>

      {view === "spiral" && !reducedMotion ? (
        <div className="mt-8">
          {/* Phase 3 (3.8): plain instruction, no apology copy. The
              List view above is a real button toggle and is reachable
              by keyboard; the spiral default is unchanged here —
              Phase 4.4 owns the Grid default. */}
          <p className="text-center text-sm text-cream/75">
            Drag to spin, tap a card to read it.
          </p>
          <div
            className="h-[560px]"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
            }}
            onClick={(e) => {
              const item = (e.target as HTMLElement).closest('[role="listitem"]');
              const name = item?.getAttribute("aria-label");
              const card = cards.find((c) => c.name === name);
              if (card) setSelected(card.id);
            }}
            onPointerDown={(e) => {
              tapStartRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              const start = tapStartRef.current;
              tapStartRef.current = null;
              if (!start) return;
              const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
              if (moved > 12) return;
              const under = document.elementFromPoint(e.clientX, e.clientY);
              const item = under?.closest('[role="listitem"]');
              const name = item?.getAttribute("aria-label");
              const card = cards.find((c) => c.name === name);
              if (card) setSelected(card.id);
            }}
          >
            <InfiniteSpiral
              items={cards.map((c) => ({
                id: c.id,
                src: c.image,
                alt: c.name,
                label: c.name,
              }))}
              animationMode="all"
              speed={0.55}
              direction="up"
              grayscale={0}
              radius={170}
              cardWidth={120}
              cardHeight={180}
              verticalSpacing={58}
              perspective={1000}
              cardsPerTurn={7}
              rotation={0}
              cardTilt={0}
              cardRadius={10}
              centerScale={1.2}
              edgeFade={0.3}
              edgeBlur={6}
              pauseOnHover
              imageFit="cover"
            />
          </div>
          {cards.length === 0 && (
            <div className="mt-8 text-center">
              <p className="text-mist">
                No cards match {query.trim() ? `"${query.trim()}"` : "your search"}. Try another name, or reset the filters.
              </p>
              <button
                type="button"
                onClick={() => { setQuery(""); setFilter("all"); }}
                className="mt-3 rounded-full border border-gold/30 px-4 py-2 text-sm font-semibold text-goldbright hover:border-gold/60"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
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
            {/* Validator fix: a button may only contain phrasing
                content, so the tile image wrapper and name are spans
                with block display, not div and p. Same layout. */}
            <span className="relative block aspect-[3/5] w-full">
              {/* Axe fix: the button already carries aria-label
                  "View meaning of {name}" and the name is visible
                  below, so a named alt would repeat it 78 times. */}
              <Image
                src={c.image}
                alt=""
                fill
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                className="object-cover"
                loading={i < 12 ? "eager" : "lazy"}
              />
            </span>
            <span className="block truncate px-2 py-2 text-xs font-medium text-cream/90 group-hover:text-goldbright">
              {c.name}
            </span>
          </motion.button>
        ))}
      </div>

      {cards.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-mist">
            No cards match {query.trim() ? `"${query.trim()}"` : "your search"}. Try another name, or reset the filters.
          </p>
          <button
            type="button"
            onClick={() => { setQuery(""); setFilter("all"); }}
            className="mt-3 rounded-full border border-gold/30 px-4 py-2 text-sm font-semibold text-goldbright hover:border-gold/60"
          >
            Reset filters
          </button>
        </div>
      )}
      </>
      )}

      <CardModal cardId={selected} onClose={() => setSelected(null)} />

      <p className="mt-10 text-center text-xs text-mist">
        Card imagery: the public-domain Rider-Waite deck (1909). Meanings are
        original to {SUITS.length ? "Sortes" : ""} and written for reflection.
      </p>
    </div>
  );
}

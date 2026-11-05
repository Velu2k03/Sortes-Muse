import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import {
  CARDS,
  cardSlug,
  getCardBySlug,
  suitElement,
  suitLabel,
} from "@/lib/cards";
import { APP_SHORT } from "@/lib/site";

// Phase 4A (4.4): one deep-linkable, shareable page per card, all 78
// statically generated from src/data/cards.json. No per-card spread
// mapping exists in the data, so the reading links point at the real
// spreads (Quick Insight first, free) rather than an invented match.
export function generateStaticParams() {
  return CARDS.map((c) => ({ slug: cardSlug(c.name) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = getCardBySlug(slug);
  if (!card) return { title: "Card not found" };
  // Phase 4C (4.10a): the title must NOT carry "| Sortes" itself.
  // The root layout template is "%s | Sortes", so the old suffix here
  // rendered "The Fool Tarot Card Meaning | Sortes | Sortes".
  return {
    title: `${card.name} Tarot Card Meaning`,
    description: card.meaning.upright,
    alternates: { canonical: `/deck/${slug}` },
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = getCardBySlug(slug);
  if (!card) notFound();

  const index = CARDS.findIndex((c) => c.id === card.id);
  const prev = CARDS[(index - 1 + CARDS.length) % CARDS.length];
  const next = CARDS[(index + 1) % CARDS.length];
  const element = suitElement(card.suit);
  const facts = [
    { label: "Arcana", value: card.arcana === "major" ? "Major Arcana" : "Minor Arcana" },
    ...(card.suit ? [{ label: "Suit", value: suitLabel(card.suit) }] : []),
    ...(element ? [{ label: "Element", value: element }] : []),
    { label: "Number", value: String(card.number) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/deck", label: "Deck" },
          { label: card.name },
        ]}
      />

      <div className="grid gap-10 md:grid-cols-[280px_1fr]">
        <div>
          <div className="relative mx-auto aspect-[3/5] w-full max-w-70 overflow-hidden rounded-2xl border border-gold/25 shadow-[0_12px_30px_rgba(212,175,55,0.15)]">
            <Image
              src={card.image}
              alt={`${card.name} tarot card`}
              fill
              sizes="280px"
              className="object-cover"
              priority
            />
          </div>
          <dl className="mt-6 space-y-2 text-sm">
            {facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-4 border-b border-gold/10 pb-2">
                <dt className="text-mist">{f.label}</dt>
                <dd className="font-semibold text-cream">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">
            {card.arcana === "major" ? "Major Arcana" : "Minor Arcana"}
          </p>
          <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
            {card.name}
          </h1>
          <p className="mt-4 text-xs italic text-mist">
            For reflection, not prediction.
          </p>

          <section aria-labelledby="upright-heading" className="mt-8">
            <h2 id="upright-heading" className="font-display text-2xl text-goldbright">
              Upright
            </h2>
            <p className="mt-2 flex flex-wrap gap-2" aria-label="Upright keywords">
              {card.keywords.upright.map((k) => (
                <span key={k} className="rounded-full border border-gold/30 px-3 py-1 text-xs font-semibold text-cream/85">
                  {k}
                </span>
              ))}
            </p>
            <p className="mt-3 max-w-2xl leading-relaxed text-cream/85">
              {card.meaning.upright}
            </p>
          </section>

          <section aria-labelledby="reversed-heading" className="mt-8">
            <h2 id="reversed-heading" className="font-display text-2xl text-goldbright">
              Reversed
            </h2>
            <p className="mt-2 flex flex-wrap gap-2" aria-label="Reversed keywords">
              {card.keywords.reversed.map((k) => (
                <span key={k} className="rounded-full border border-gold/30 px-3 py-1 text-xs font-semibold text-cream/85">
                  {k}
                </span>
              ))}
            </p>
            <p className="mt-3 max-w-2xl leading-relaxed text-cream/85">
              {card.meaning.reversed}
            </p>
          </section>

          <section aria-labelledby="reading-heading" className="mt-10 rounded-3xl border border-gold/20 bg-panel/60 p-6">
            <h2 id="reading-heading" className="font-display text-2xl text-goldbright">
              Use this card in a reading
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-cream/75">
              Draw a fresh spread and see where {card.name} lands, or start
              with one card and one question.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/spreads/quick-insight" className="btn-gold rounded-xl px-5 py-2.5 text-sm font-bold">
                Quick Insight, free first
              </Link>
              <Link href="/spreads/past-present-future" className="rounded-xl border border-gold/30 px-5 py-2.5 text-sm font-semibold text-goldbright hover:border-gold/60">
                Past / Present / Future
              </Link>
              <Link href="/spreads/celtic-cross" className="rounded-xl border border-gold/30 px-5 py-2.5 text-sm font-semibold text-goldbright hover:border-gold/60">
                Celtic Cross
              </Link>
              <Link href="/spreads" className="rounded-xl border border-gold/30 px-5 py-2.5 text-sm font-semibold text-goldbright hover:border-gold/60">
                All spreads
              </Link>
            </div>
          </section>

          <nav aria-label="Browse cards" className="mt-10 flex items-center justify-between gap-4 border-t border-gold/15 pt-6">
            <Link href={`/deck/${cardSlug(prev.name)}`} className="text-sm font-semibold text-goldbright underline underline-offset-4">
              ← {prev.name}
            </Link>
            <Link href="/deck" className="text-sm font-semibold text-cream/80 hover:text-goldbright">
              All 78 cards
            </Link>
            <Link href={`/deck/${cardSlug(next.name)}`} className="text-sm font-semibold text-goldbright underline underline-offset-4">
              {next.name} →
            </Link>
          </nav>
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-mist">
        Card imagery: the public-domain Rider-Waite deck (1909). Meanings are
        original to {APP_SHORT} and written for reflection.
      </p>
    </div>
  );
}

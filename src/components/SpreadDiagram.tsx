import Image from "next/image";
import type { Spread } from "@/lib/types";
import { CARD_BACK } from "@/lib/tarot";

// Batch 4a: the old SVG wireframe scaled its 12px labels down to
// ~5.7px (0.47x in ReadingFlow's w-40, ~0.59x in SpreadsClient's
// h-36), so the diagram was an unreadable CAD sketch. The diagram
// is now miniature card backs with a gold number badge per position,
// laid out in the same geometry. Position LABELS live in the HTML
// legend beside the diagram (the <ol> in ReadingFlow, the
// "Positions in this spread" details in SpreadsClient), so nothing
// in the diagram itself is text that can shrink. The container sizes
// itself from the layout's aspect ratio, so it can never be squeezed
// flat again: width is capped per shape, height follows.
const GOLD = "#d4af37";

interface PlacedCard {
  key: string;
  label: string;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Layout per spread shape. The cross maps positions by meaning, not
// by array order alone: Present at the centre, Challenge crossing
// it, Past to the left, Future to the right, Above on top, Below
// underneath, and Advice / External / Hopes & Fears / Outcome as
// the staff row beneath, Advice to Outcome (bottom to top).
function layout(spread: Spread): { width: number; height: number; cards: PlacedCard[] } {
  const positions = spread.positions;
  if (spread.cards === 1) {
    return {
      width: 120,
      height: 190,
      cards: positions.map((p, i) => ({ key: p.key, label: p.label, index: i + 1, x: 30, y: 15, w: 60, h: 96 })),
    };
  }
  if (spread.cards === 3) {
    return {
      width: 300,
      height: 190,
      cards: positions.map((p, i) => ({ key: p.key, label: p.label, index: i + 1, x: 15 + i * 105, y: 15, w: 60, h: 96 })),
    };
  }
  if (spread.cards === 10) {
    const byKey = new Map(positions.map((p, i) => [p.key, { ...p, index: i + 1 }]));
    const at = (key: string, x: number, y: number, w: number, h: number): PlacedCard => {
      const p = byKey.get(key) ?? positions[0];
      const index = positions.findIndex((q) => q.key === key) + 1;
      return { key: p.key, label: p.label, index, x, y, w, h };
    };
    return {
      width: 340,
      height: 372,
      cards: [
        at("present", 122, 88, 96, 112),
        at("challenge", 112, 127, 116, 34),
        at("past", 8, 112, 96, 64),
        at("future", 236, 112, 96, 64),
        at("above", 122, 8, 96, 64),
        at("below", 122, 216, 96, 64),
        at("advice", 1, 300, 74, 64),
        at("external", 89, 300, 74, 64),
        at("hopes", 177, 300, 74, 64),
        at("outcome", 265, 300, 74, 64),
      ],
    };
  }
  // Fallback for any future spread shape: a plain row.
  return {
    width: positions.length * 75 + 15,
    height: 190,
    cards: positions.map((p, i) => ({ key: p.key, label: p.label, index: i + 1, x: 15 + i * 75, y: 15, w: 60, h: 96 })),
  };
}

// Width cap per shape, so a single card does not grow into a tall
// empty column: one card reads at 144px wide, a triad and the cross
// at 288px. Height always follows the aspect ratio.
function maxWidthFor(spread: Spread): number {
  return spread.cards === 1 ? 144 : 288;
}

export default function SpreadDiagram({ spread }: { spread: Spread }) {
  const { width, height, cards } = layout(spread);
  return (
    <div
      role="img"
      aria-label={`${spread.name} layout: ${spread.positions.map((p, i) => `${i + 1}. ${p.label}`).join(", ")}`}
      className="relative mx-auto w-full"
      style={{ aspectRatio: `${width} / ${height}`, maxWidth: maxWidthFor(spread) }}
    >
      {cards.map((c) => (
        <div
          key={c.key}
          className="absolute overflow-hidden rounded-md border border-gold/40 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
          style={{
            left: `${(c.x / width) * 100}%`,
            top: `${(c.y / height) * 100}%`,
            width: `${(c.w / width) * 100}%`,
            height: `${(c.h / height) * 100}%`,
          }}
        >
          <Image
            src={CARD_BACK}
            alt=""
            fill
            sizes="(max-width: 640px) 96px, 128px"
            className="object-cover"
            draggable={false}
          />
          {/* Short cards (the Challenge bar, 34 units tall) are
              ~19px high at the narrowest container, so a top-left
              badge would clip, and a centred badge lands on top of
              badge 1: the bar crosses the Present card, so the bar's
              centre is the Present card's centre, and the two 16px
              badges merge into one blob at thumbnail size (their
              centres are only ~7px apart at 112px). The badge sits
              at the bar's right end instead, vertically centred,
              which is the farthest point on the bar from badge 1.
              The badge is 16px so it stays proportionate on the
              narrowest cards (staff row, ~42px wide at w-48), and
              z-10 so it paints above any card that overlaps it
              (the bar paints over badge 1's lower half without it). */}
          <span
            aria-hidden="true"
            className={`absolute z-10 flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold leading-none ${
              c.h <= 40 ? "right-1 top-1/2 -translate-y-1/2" : "left-1 top-1"
            }`}
            style={{ backgroundColor: GOLD, color: "#14182a" }}
          >
            {c.index}
          </span>
        </div>
      ))}
    </div>
  );
}

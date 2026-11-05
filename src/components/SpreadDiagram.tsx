import type { Spread } from "@/lib/types";

// Phase 4A (4.5): crisp sacred-geometry spread diagrams in gold-on-dark
// linework, replacing the blurred "locked" card-back preview blobs.
// One diagram per spread shape: a single card, a three-card triad,
// and the classic ten-card Celtic Cross (cross + staff). Every
// position is drawn as a labelled card outline, so the layout itself
// teaches the spread. Static SVG: no animation, nothing to blur.
const GOLD = "#d4af37";
const INK = "#ede6d6";

interface PlacedCard {
  key: string;
  label: string;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function labelLines(label: string): string[] {
  if (label.length <= 9) return [label];
  const words = label.split(" ");
  let first = "";
  let rest = words.join(" ");
  for (let i = 1; i < words.length; i++) {
    const head = words.slice(0, i).join(" ");
    const tail = words.slice(i).join(" ");
    if (Math.abs(head.length - tail.length) < Math.abs(first.length - rest.length)) {
      first = head;
      rest = tail;
    }
  }
  return first ? [first, rest] : [label];
}

// Layout per spread shape. The cross maps positions by meaning, not
// by array order alone: Present at the centre, Challenge crossing
// it, Past to the left, Future to the right, Above on top, Below
// underneath, and Advice / External / Hopes & Fears / Outcome as
// the staff on the right, bottom to top.
function layout(spread: Spread): { viewBox: string; cards: PlacedCard[] } {
  const positions = spread.positions;
  if (spread.cards === 1) {
    return {
      viewBox: "0 0 120 190",
      cards: positions.map((p, i) => ({ key: p.key, label: p.label, index: i + 1, x: 30, y: 15, w: 60, h: 96 })),
    };
  }
  if (spread.cards === 3) {
    return {
      viewBox: "0 0 300 190",
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
      viewBox: "0 0 360 270",
      cards: [
        at("present", 104, 96, 52, 80),
        at("challenge", 88, 112, 84, 48),
        at("past", 40, 96, 52, 80),
        at("future", 168, 96, 52, 80),
        at("above", 104, 8, 52, 80),
        at("below", 104, 184, 52, 80),
        at("advice", 264, 200, 52, 56),
        at("external", 264, 136, 52, 56),
        at("hopes", 264, 72, 52, 56),
        at("outcome", 264, 8, 52, 56),
      ],
    };
  }
  // Fallback for any future spread shape: a plain row.
  return {
    viewBox: `0 0 ${positions.length * 75 + 15} 190`,
    cards: positions.map((p, i) => ({ key: p.key, label: p.label, index: i + 1, x: 15 + i * 75, y: 15, w: 60, h: 96 })),
  };
}

export default function SpreadDiagram({ spread }: { spread: Spread }) {
  const { viewBox, cards } = layout(spread);
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={`${spread.name} layout: ${spread.positions.map((p, i) => `${i + 1}. ${p.label}`).join(", ")}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {cards.map((c) => {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        const lines = labelLines(c.label);
        const labelStart = cy - (lines.length - 1) * 5 + 8;
        return (
          <g key={c.key}>
            <rect
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx={6}
              fill="rgba(212,175,55,0.06)"
              stroke={GOLD}
              strokeWidth={1.5}
            />
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={GOLD}>
              {c.index}
            </text>
            {lines.map((line, i) => (
              <text
                key={line}
                x={cx}
                y={labelStart + i * 10}
                textAnchor="middle"
                fontSize={8.5}
                fill={INK}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

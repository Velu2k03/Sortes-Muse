"use client";

import type { WesternResult } from "@/lib/charts";

// Audit 5 custom wheel: AstroChart cannot stagger planet labels inside
// its SVG, so the dense Capricorn cluster (Uranus, Sun, Neptune, Saturn,
// Mercury, plus Venus nearby) stacked on the wheel itself. This wheel is
// drawn from the same WesternResult positions, so chart math is unchanged.
// Ascendant is at the left (9 o'clock); zodiac order runs counter-clockwise
// from there. Planet labels are staggered ON the wheel: consecutive
// planets whose true longitudes are within 8 degrees get display angles
// pushed apart by 9 degrees each, with a leader line from the true
// position dot to the staggered label. The planet table above remains
// the exact primary, and the staggered list below it still lists clusters.
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
const ABBR: Record<string, string> = {
  Sun: "Sun", Moon: "Moon", Mercury: "Merc", Venus: "Venus", Mars: "Mars",
  Jupiter: "Jup", Saturn: "Sat", Uranus: "Ura", Neptune: "Nep", Pluto: "Plu",
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r1, a0);
  const p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r0, a1);
  const p3 = polar(cx, cy, r0, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r1} ${r1} 0 ${large} 0 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r0} ${r0} 0 ${large} 1 ${p3.x} ${p3.y} Z`;
}

export default function CustomWesternWheel({ result, theme }: { result: WesternResult; theme: "dark" | "light" }) {
  const cx = 320;
  const cy = 320;
  const dark = theme === "dark";
  const bg = dark ? "#1a1f2e" : "#fffdf5";
  const text = dark ? "#ede6d6" : "#1c1a15";
  const gold = dark ? "#f4d03f" : "#7c5e00";
  const line = dark ? "#d4af37" : "#8a6d0a";
  const asc = result.ascendantLongitude;
  // Screen angle for an ecliptic longitude: Ascendant at 180 degrees
  // (left), zodiac increasing counter-clockwise from there.
  const angleFor = (lon: number) => 180 - ((lon - asc + 360) % 360);

  const sorted = [...result.planets].sort((a, b) => a.longitude - b.longitude);
  // Stagger display angles in zodiac order so labels never stack.
  const display: Record<string, number> = {};
  let prevTrue: number | null = null;
  let prevDisplay: number | null = null;
  for (const p of sorted) {
    let d = angleFor(p.longitude);
    if (prevTrue !== null && prevDisplay !== null) {
      const gap = (p.longitude - prevTrue + 360) % 360;
      if (gap < 8) d = prevDisplay - 9;
    }
    display[p.name] = d;
    prevTrue = p.longitude;
    prevDisplay = d;
  }

  return (
    <svg viewBox="0 0 640 640" role="img" aria-label="Western birth chart wheel with staggered planet labels" className="mx-auto w-full min-w-[640px] max-w-[640px]">
      <circle cx={cx} cy={cy} r={310} fill={bg} stroke={line} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={262} fill="none" stroke={line} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={180} fill="none" stroke={line} strokeWidth={1} strokeOpacity={0.5} />
      {SIGNS.map((name, i) => {
        const a0 = angleFor(i * 30);
        const a1 = angleFor(i * 30 + 30);
        const mid = a0 - 15;
        const glyph = polar(cx, cy, 286, mid);
        return (
          <g key={name}>
            <path d={wedge(cx, cy, 262, 310, a1, a0)} fill="none" stroke={line} strokeWidth={0.5} strokeOpacity={0.4} />
            <text x={glyph.x} y={glyph.y} textAnchor="middle" dominantBaseline="middle" fontSize={22} fill={gold}>
              {SIGN_GLYPHS[i]}
            </text>
          </g>
        );
      })}
      {result.cusps.map((cusp, i) => {
        const a = angleFor(cusp);
        const p0 = polar(cx, cy, 180, a);
        const p1 = polar(cx, cy, 262, a);
        const next = result.cusps[(i + 1) % result.cusps.length];
        const midLon = (cusp + (((next - cusp + 360) % 360) / 2)) % 360;
        const num = polar(cx, cy, 150, angleFor(midLon));
        return (
          <g key={i}>
            <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={line} strokeWidth={i % 3 === 0 ? 1.2 : 0.6} strokeOpacity={i % 3 === 0 ? 0.9 : 0.5} />
            <text x={num.x} y={num.y} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill={text} opacity={0.8}>
              {i + 1}
            </text>
          </g>
        );
      })}
      {result.planets.map((p) => {
        const trueAngle = angleFor(p.longitude);
        const labelAngle = display[p.name];
        const dot = polar(cx, cy, 210, trueAngle);
        const label = polar(cx, cy, 242, labelAngle);
        return (
          <g key={p.name}>
            <line x1={dot.x} y1={dot.y} x2={label.x} y2={label.y} stroke={line} strokeWidth={0.8} strokeOpacity={0.7} />
            <circle cx={dot.x} cy={dot.y} r={4} fill={gold} />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={700} fill={text}>
              {ABBR[p.name] ?? p.name}
            </text>
          </g>
        );
      })}
      <text x={polar(cx, cy, 296, 180).x} y={polar(cx, cy, 296, 180).y} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={700} fill={gold}>
        As
      </text>
      <text x={polar(cx, cy, 296, angleFor(result.midheavenLongitude)).x} y={polar(cx, cy, 296, angleFor(result.midheavenLongitude)).y} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={700} fill={gold}>
        Mc
      </text>
    </svg>
  );
}

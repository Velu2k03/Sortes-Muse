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
  // Audit 6 root cause: the old rule pushed only planets within 8
  // degrees of the previous planet by 9 degrees each, and checked only
  // that previous planet. Mercury's true angle then landed 2 degrees
  // from Neptune's staggered label, so Merc and Nep still overlapped.
  // New rule: every label must sit at least MIN_LABEL_SEP degrees
  // (shortest circular distance) from EVERY earlier label, pushing
  // in the decreasing-angle direction until it does. This is checked
  // against all placed labels, not just the previous one, so a
  // staggered label cannot land on an earlier label either.
  const MIN_LABEL_SEP = 12;
  const wrap180 = (d: number) => ((d + 180) % 360 + 360) % 360 - 180;
  const circDist = (a: number, b: number) => Math.abs(wrap180(a - b));
  const display: Record<string, number> = {};
  const placed: number[] = [];
  for (const p of sorted) {
    let d = angleFor(p.longitude);
    for (let iter = 0; iter < 60; iter++) {
      let worstDist = MIN_LABEL_SEP;
      for (const prev of placed) {
        const dist = circDist(d, prev);
        if (dist < worstDist) worstDist = dist;
      }
      if (worstDist >= MIN_LABEL_SEP) break;
      d = wrap180(d - (MIN_LABEL_SEP - worstDist));
    }
    display[p.name] = d;
    placed.push(d);
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
      <text x={polar(cx, cy, 282, 180).x} y={polar(cx, cy, 282, 180).y} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={700} fill={gold}>
        As
      </text>
      {(() => {
        // Audit 6: Mc sat 11.8px from the Scorpio sign glyph at the
        // bottom of the wheel, because both sit near angle -100 at
        // radius ~290. Moving Mc radially in only made it worse
        // (8.3px), so Mc is nudged tangentially away from the
        // nearest sign glyph instead: 24px along the tangent
        // (-sin a, -cos a), in the direction away from that glyph.
        const mcAngle = angleFor(result.midheavenLongitude);
        const signMids = SIGNS.map((_, i) => angleFor(i * 30) - 15);
        let nearest = signMids[0];
        let nearestDist = Math.abs(wrap180(mcAngle - nearest));
        for (const mid of signMids) {
          const dist = Math.abs(wrap180(mcAngle - mid));
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = mid;
          }
        }
        const diff = wrap180(mcAngle - nearest);
        const mcTangent = diff >= 0 ? 1 : -1;
        const a = (mcAngle * Math.PI) / 180;
        const base = polar(cx, cy, 296, mcAngle);
        const mcX = base.x + mcTangent * 24 * -Math.sin(a);
        const mcY = base.y + mcTangent * 24 * -Math.cos(a);
        return (
          <text x={mcX} y={mcY} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={700} fill={gold}>
            Mc
          </text>
        );
      })()}
    </svg>
  );
}

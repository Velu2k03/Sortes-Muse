// North Indian diamond (rasi) chart, drawn from the computed Vedic
// placements: whole-sign houses, Lagna at the top diamond, houses
// running counter-clockwise. Geometry lives in lib/vedic-diamond.ts
// (tested: the 12 cells tile the square exactly). Colours come from
// the site tokens via var(), so the chart follows the theme with no
// JS theme tracking. The planet table in VedicChart stays the exact
// primary; crowded houses show at most 4 planets plus a count.
import type { VedicResult } from "@/lib/vedic";
import {
  DIAMOND_SIZE,
  diamondCells,
  planetsByHouse,
  signIndexForHouse,
  SIGN_ABBR,
  SIGN_NAMES,
} from "@/lib/vedic-diamond";

const MAX_PLANETS_SHOWN = 4;

export default function VedicDiamondChart({ result }: { result: VedicResult }) {
  const lagnaSignIndex = result.ascendantSign ? SIGN_NAMES.indexOf(result.ascendantSign) : -1;
  // The parent renders this only when the Lagna is known; the guard
  // keeps the component safe for any caller.
  if (lagnaSignIndex < 0) {
    return (
      <p className="text-sm text-cream/80">
        No diamond chart without a birth time: the diamond is drawn around the Lagna and houses, which are withheld
        for unknown-time charts.
      </p>
    );
  }
  const byHouse = planetsByHouse(result.planets);
  const cells = diamondCells();
  const points = (polygon: { x: number; y: number }[]) =>
    polygon.map((p) => `${p.x},${p.y}`).join(" ");
  const S = DIAMOND_SIZE;
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      role="img"
      aria-label={`North Indian diamond chart, Lagna ${result.ascendantSign}`}
      className="mx-auto h-auto w-full max-w-[480px]"
    >
      {/* Frame: outer square, both diagonals, diamond of midpoints. */}
      <g fill="none" strokeWidth={1} style={{ stroke: "var(--color-gold)" }}>
        <rect x={0.5} y={0.5} width={S - 1} height={S - 1} />
        <line x1={0} y1={0} x2={S} y2={S} />
        <line x1={S} y1={0} x2={0} y2={S} />
        <polygon points={`200,0 400,200 200,400 0,200`} />
      </g>
      {cells.map((cell) => {
        const signIdx = signIndexForHouse(lagnaSignIndex, cell.house);
        const planets = byHouse[cell.house] ?? [];
        const shown = planets.slice(0, MAX_PLANETS_SHOWN);
        const extra = planets.length - shown.length;
        const lines = [...shown, ...(extra > 0 ? [`+${extra} more`] : [])];
        // Text block centred on the cell centroid: sign line, then
        // one line per planet. Line height 12, sign 12 bold.
        const blockHeight = (lines.length + 1) * 12;
        const firstBaseline = cell.centroid.y - blockHeight / 2 + 10;
        return (
          <g key={cell.house}>
            {cell.house === 1 && (
              <polygon points={points(cell.polygon)} fill="var(--color-gold)" fillOpacity={0.12} stroke="none" />
            )}
            <text
              x={cell.centroid.x}
              y={firstBaseline}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              style={{ fill: "var(--color-goldbright)" }}
            >
              {SIGN_ABBR[signIdx]}
              {cell.house === 1 ? " · Lg" : ""}
            </text>
            {lines.map((label, i) => (
              <text
                key={`${cell.house}-${label}`}
                x={cell.centroid.x}
                y={firstBaseline + (i + 1) * 12}
                textAnchor="middle"
                fontSize={10}
                style={{ fill: "var(--color-cream)" }}
              >
                {label}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

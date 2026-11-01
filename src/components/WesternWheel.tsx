"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { WesternResult } from "@/lib/charts";

// AstroChart manipulates the DOM and uses `self`, so it must load in the
// browser only, after mount. The planet table below keeps the same data
// readable without the SVG (accessibility) and if the wheel fails to load.
// Theme: AstroChart's 4th constructor argument overrides its white/black
// defaults. The old per-sign glyph colours were the problem on the dark
// panel: brown Taurus/Capricorn/Virgo glyphs were 2.31:1, below WCAG AA.
// COLORS_SIGNS (and the individual COLOR_* sign keys, which the library
// also reads) are now all goldbright, 10.90:1 on the panel, and planet
// glyphs are cream, 13.20:1. Wheel glyph hover is library-controlled, so
// planet highlight lives in the table below, not by hacking the library DOM.
// Audit 3 wheel fixes, via theme options AstroChart actually exposes
// (project/src/settings.ts): CIRCLE_STRONG 2 -> 1 thins the gold
// ring, MARGIN 50 -> 72 leaves room for axis labels so Ic is not
// clipped at the edge, SYMBOL_SCALE 1 -> 0.85 shrinks glyphs.
// Audit 4 root cause, found by reading the library, not by guessing
// another setting: radix.ts drawUniverse fills each 30-degree sign
// segment with COLORS_SIGNS[i]. Batch 5 set every COLORS_SIGNS entry
// to goldbright #f4d03f, and sign glyphs are stroked with SIGNS_COLOR,
// also #f4d03f, so the band was a solid gold fill with gold glyphs
// drawn on gold, which is why it read as a thick heavy ring and the
// glyphs were not discernible, even though CIRCLE_STRONG 1,
// INNER_CIRCLE_RADIUS_RATIO 16, and MARGIN 72 were genuinely passed
// to the constructor. Fix: the band fill is the wheel background
// colour, so the band visually disappears and only the 1px circle
// strokes remain, and glyphs contrast against that background.
// Individual COLOR_* sign keys are NOT read for the band (only
// COLORS_SIGNS is, in radix.ts); they stay goldbright only as the
// library's fallback when COLORS_SIGNS is absent. No DOM hacking,
// no leader lines (the library does not expose them); de-clustering
// for the dense Capricorn group is the staggered cluster list below
// the table, in ordinary markup, not inside the wheel SVG.
const WHEEL_THEME = {
  CIRCLE_STRONG: 1,
  // Sign band is radius/INNER_CIRCLE_RADIUS_RATIO wide (radix.ts
  // drawUniverse): 8 gave a ~31px band at radius 248, 16 halves it
  // to ~15px, and with the fill below equal to the background the
  // band itself is invisible, leaving only thin circle strokes.
  INNER_CIRCLE_RADIUS_RATIO: 16,
  MARGIN: 72,
  SYMBOL_SCALE: 0.85,
  POINTS_STROKE: 1.6,
  SIGNS_STROKE: 1.6,
  SYMBOL_AXIS_STROKE: 1.2,
  COLOR_BACKGROUND: "#1a1f2e",
  POINTS_COLOR: "#ede6d6",
  SIGNS_COLOR: "#f4d03f",
  CIRCLE_COLOR: "#d4af37",
  LINE_COLOR: "#d4af37",
  CUSPS_FONT_COLOR: "#ede6d6",
  SYMBOL_AXIS_FONT_COLOR: "#f4d03f",
  // Band fill must equal the wheel background, not gold: see the
  // Audit 4 root-cause comment above. Gold glyphs on a gold band
  // were the thick-ring / indiscernible-glyph bug.
  COLORS_SIGNS: Array(12).fill("#1a1f2e"),
  COLOR_ARIES: "#f4d03f",
  COLOR_TAURUS: "#f4d03f",
  COLOR_GEMINI: "#f4d03f",
  COLOR_CANCER: "#f4d03f",
  COLOR_LEO: "#f4d03f",
  COLOR_VIRGO: "#f4d03f",
  COLOR_LIBRA: "#f4d03f",
  COLOR_SCORPIO: "#f4d03f",
  COLOR_SAGITTARIUS: "#f4d03f",
  COLOR_CAPRICORN: "#f4d03f",
  COLOR_AQUARIUS: "#f4d03f",
  COLOR_PISCES: "#f4d03f",
};

// Light theme for the wheel only: AstroChart takes its colours as a
// theme object, so the wheel is re-rendered with a light theme when
// the header toggle fires sortes-theme-change. Light glyph colours
// are dark ink and dark gold on the cream wheel background, so they
// pass AA there, same as the dark theme passes on the dark panel.
const WHEEL_THEME_LIGHT = {
  ...WHEEL_THEME,
  COLOR_BACKGROUND: "#fffdf5",
  POINTS_COLOR: "#1c1a15",
  SIGNS_COLOR: "#7c5e00",
  CIRCLE_COLOR: "#8a6d0a",
  LINE_COLOR: "#8a6d0a",
  CUSPS_FONT_COLOR: "#1c1a15",
  SYMBOL_AXIS_FONT_COLOR: "#7c5e00",
  // Light band fill equals the light wheel background #fffdf5, for
  // the same Audit 4 reason: a dark-gold fill would read as a thick
  // solid ring and hide the dark-gold glyphs drawn on it.
  COLORS_SIGNS: Array(12).fill("#fffdf5"),
  COLOR_ARIES: "#7c5e00",
  COLOR_TAURUS: "#7c5e00",
  COLOR_GEMINI: "#7c5e00",
  COLOR_CANCER: "#7c5e00",
  COLOR_LEO: "#7c5e00",
  COLOR_VIRGO: "#7c5e00",
  COLOR_LIBRA: "#7c5e00",
  COLOR_SCORPIO: "#7c5e00",
  COLOR_SAGITTARIUS: "#7c5e00",
  COLOR_CAPRICORN: "#7c5e00",
  COLOR_AQUARIUS: "#7c5e00",
  COLOR_PISCES: "#7c5e00",
};

export default function WesternWheel({ result }: { result: WesternResult }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const elementId = `western-wheel-${rawId}`;
  const [wheelError, setWheelError] = useState(false);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
  const [wheelTheme, setWheelTheme] = useState<"dark" | "light">("dark");
  const reduce = useReducedMotion();
  useEffect(() => {
    const sync = () => {
      setWheelTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    };
    sync();
    window.addEventListener("sortes-theme-change", sync);
    return () => window.removeEventListener("sortes-theme-change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = "";
    import("@astrodraw/astrochart")
      .then((mod) => {
        if (cancelled) return;
        const Chart = (mod as { default?: unknown; Chart?: unknown }).default ?? (mod as { Chart?: unknown }).Chart;
        if (typeof Chart !== "function") throw new Error("AstroChart Chart not found");
        const planets: Record<string, number[]> = {};
        for (const p of result.planets) planets[p.name] = [p.longitude];
        const chart = new (Chart as new (id: string, w: number, h: number, settings?: unknown) => { radix: (d: unknown) => void })(
          elementId,
          640,
          640,
          wheelTheme === "light" ? WHEEL_THEME_LIGHT : WHEEL_THEME,
        );
        chart.radix({ planets, cusps: result.cusps });
      })
      .catch(() => {
        if (!cancelled) setWheelError(true);
      });
    return () => {
      cancelled = true;
      const el = document.getElementById(elementId);
      if (el) el.innerHTML = "";
    };
  }, [elementId, result, wheelTheme]);

  return (
    <div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
        <span>
          Sun: <strong className="text-cream">{result.sunSign}</strong>
        </span>
        <span>
          Rising: <strong className="text-cream">{result.ascendantSign}</strong> ({result.ascendantLongitude.toFixed(2)}°)
        </span>
        <span>
          Midheaven: <strong className="text-cream">{result.midheavenSign}</strong> ({result.midheavenLongitude.toFixed(2)}°)
        </span>
        <span>Aspects found: {result.aspectCount}</span>
        {result.unknownTime && (
          <span className="text-goldbright">Unknown birth time: calculated at noon, Rising and houses are approximate.</span>
        )}
      </div>
      <h3 className="mt-6 font-display text-xl text-goldbright">Planet table: read this first</h3>
      <p className="mt-1 text-sm text-cream/80">Exact positions, signs, and houses. The wheel below is a visual overview only; its glyphs can overlap when planets cluster.</p>
      <div className="mt-4 overflow-x-auto">
      <table className="min-w-[520px] w-full text-left text-sm text-cream/85">
        <thead>
          <tr className="border-b border-gold/25 text-cream/80">
            <th className="py-2 pr-4">Planet</th>
            <th className="py-2 pr-4">Sign</th>
            <th className="py-2 pr-4">Longitude</th>
            <th className="py-2">House</th>
          </tr>
        </thead>
        <tbody>
          {result.planets.map((p) => (
            <tr
              key={p.name}
              onClick={() => setSelectedPlanet(p.name)}
              onMouseEnter={() => setSelectedPlanet(p.name)}
              className={`cursor-pointer border-b border-gold/10 ${selectedPlanet === p.name ? "bg-gold/10" : ""}`}
            >
              <td className="py-2 pr-4 font-semibold text-cream">{p.name}</td>
              <td className="py-2 pr-4">{p.sign}</td>
              <td className="py-2 pr-4">{p.longitude.toFixed(2)}°</td>
              <td className="py-2">{p.house ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {selectedPlanet && (
        <p className="mt-4 text-sm text-goldbright">
          {(() => {
            const p = result.planets.find((x) => x.name === selectedPlanet);
            return p ? `${p.name}: ${p.sign}, ${p.longitude.toFixed(2)}°, house ${p.house ?? "—"}` : "";
          })()}
        </p>
      )}
      <p className="mt-2 text-sm text-cream/80">Tap a planet row to highlight it.</p>
      {(() => {
        // Clustered planets: consecutive planets (longitude-sorted,
        // wrap-aware) within 12 degrees of the previous one, groups
        // of 3+. The wheel stacks these glyphs, so this staggered
        // list is the readable primary for a cluster, in longitude
        // order, with increasing left indent per row.
        const sorted = [...result.planets].sort((a, b) => a.longitude - b.longitude);
        const groups: typeof sorted[] = [];
        let cur: typeof sorted = [];
        for (const pl of sorted) {
          if (cur.length && (pl.longitude - cur[cur.length - 1].longitude > 12)) { groups.push(cur); cur = []; }
          cur.push(pl);
        }
        if (cur.length) groups.push(cur);
        if (groups.length > 1 && groups[0].length && groups[groups.length - 1].length) {
          const first = groups[0], last = groups[groups.length - 1];
          if (first[0].longitude + 360 - last[last.length - 1].longitude <= 12) { groups[0] = [...last, ...first]; groups.pop(); }
        }
        const clusters = groups.filter((g) => g.length >= 3);
        if (!clusters.length) return null;
        return (
          <div className="mt-4 rounded-2xl border border-gold/25 bg-panel/70 p-4">
            <p className="text-sm font-semibold text-goldbright">Clustered planets, staggered list</p>
            <p className="mt-1 text-sm text-cream/80">These planets sit close together, so their wheel glyphs overlap. Read them here, in longitude order, instead of from the wheel.</p>
            {clusters.map((g, gi) => (
              <ul key={gi} className="mt-2 space-y-1 text-sm text-cream/85">
                {g.map((pl, i) => (
                  <li key={pl.name} style={{ marginLeft: i * 14 }}>
                    {pl.name}: {pl.sign}, {pl.longitude.toFixed(2)}°, house {pl.house ?? "—"}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        );
      })()}
      <details className="mt-4 scroll-mt-24 rounded-2xl border border-gold/25 bg-panel/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">
          Aspects found: {result.aspectCount} (tap to list them)
        </summary>
        <p className="mt-2 text-xs text-cream/80">
          An aspect is an angle between two planets. Orb is how close that angle is, in degrees. Smaller orb means a tighter aspect.
          The list also includes points that are not in the 10-planet table above: Chiron, the wounded-healer asteroid; Lilith, Black Moon Lilith, the mean lunar apogee; Sirius, the brightest fixed star; North Node, the direction of growth; South Node, past patterns.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-cream/85">
          {result.aspects.map((a, i) => (
            <li key={`${a.planet1}-${a.planet2}-${a.label}-${i}`}>
              {a.planet1} {a.label} {a.planet2} · orb {a.orb.toFixed(2)}°
            </li>
          ))}
        </ul>
      </details>
      <h3 className="mt-8 scroll-mt-24 font-display text-xl text-goldbright">Wheel overview</h3>
      <p className="mt-1 text-sm text-cream/80">Visual overview only. If glyphs overlap or an axis label is clipped at the edge, use the planet table above for the exact reading.</p>
      <motion.div
        initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
        className="mt-6 overflow-x-auto rounded-2xl border border-gold/25 bg-panel/70 p-4"
      >
        {/* Wheel stays at its full 640px width and scrolls on narrow
            phones instead of shrinking, which squeezed clustered glyphs
            in the Capricorn/Aquarius sector. Leader lines are not added:
            AstroChart does not expose them, and hacking its DOM is out
            of scope; the planet table above is the readable primary list,
            this wheel is a visual overview only. */}
        <div id={elementId} className="mx-auto w-full min-w-[640px] max-w-[640px]" />
        {wheelError && <p className="p-4 text-center text-sm text-cream">The wheel could not load. The planet table above has the same data.</p>}
      </motion.div>
      <p className="mt-4 text-sm text-cream/80">
        Chart only, for reflection. Calculation is free and unsaved; interpretation, when you choose it below, is a separate step.
      </p>
    </div>
  );
}

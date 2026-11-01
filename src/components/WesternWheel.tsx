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
const WHEEL_THEME = {
  COLOR_BACKGROUND: "#1a1f2e",
  POINTS_COLOR: "#ede6d6",
  SIGNS_COLOR: "#f4d03f",
  CIRCLE_COLOR: "#d4af37",
  LINE_COLOR: "#d4af37",
  CUSPS_FONT_COLOR: "#ede6d6",
  SYMBOL_AXIS_FONT_COLOR: "#f4d03f",
  COLORS_SIGNS: Array(12).fill("#f4d03f"),
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

export default function WesternWheel({ result }: { result: WesternResult }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const elementId = `western-wheel-${rawId}`;
  const [wheelError, setWheelError] = useState(false);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
  const reduce = useReducedMotion();

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
          600,
          600,
          WHEEL_THEME,
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
  }, [elementId, result]);

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
      <motion.div
        initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
        className="mt-6 overflow-x-auto rounded-2xl border border-gold/25 bg-panel/70 p-2"
      >
        {/* Wheel stays at its full 600px width and scrolls on narrow
            phones instead of shrinking, which squeezed clustered glyphs
            in the Capricorn/Aquarius sector. Leader lines are not added:
            AstroChart does not expose them, and hacking its DOM is out
            of scope; the planet table below is the readable label list. */}
        <div id={elementId} className="mx-auto w-full min-w-[600px] max-w-[600px]" />
        {wheelError && <p className="p-4 text-center text-sm text-cream">The wheel could not load. The planet table below has the same data.</p>}
      </motion.div>
      {selectedPlanet && (
        <p className="mt-4 text-sm text-goldbright">
          {(() => {
            const p = result.planets.find((x) => x.name === selectedPlanet);
            return p ? `${p.name}: ${p.sign}, ${p.longitude.toFixed(2)}°, house ${p.house ?? "—"}` : "";
          })()}
        </p>
      )}
      <p className="mt-2 text-sm text-cream/60">Tap a planet row to highlight it.</p>
      <div className="mt-4 overflow-x-auto">
      <table className="min-w-[520px] w-full text-left text-sm text-cream/85">
        <thead>
          <tr className="border-b border-gold/25 text-cream/60">
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
      <details className="mt-4 rounded-2xl border border-gold/25 bg-panel/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">
          Aspects found: {result.aspectCount} (tap to list them)
        </summary>
        <p className="mt-2 text-xs text-cream/60">
          An aspect is an angle between two planets. Orb is how close that angle is, in degrees. Smaller orb means a tighter aspect.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-cream/85">
          {result.aspects.map((a, i) => (
            <li key={`${a.planet1}-${a.planet2}-${a.label}-${i}`}>
              {a.planet1} {a.label} {a.planet2} · orb {a.orb.toFixed(2)}°
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-4 text-sm text-cream/60">
        Chart only, for reflection. Calculation is free and unsaved; interpretation, when you choose it below, is a separate step.
      </p>
    </div>
  );
}

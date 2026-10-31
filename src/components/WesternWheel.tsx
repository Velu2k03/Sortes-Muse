"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { WesternResult } from "@/lib/charts";

// AstroChart manipulates the DOM and uses `self`, so it must load in the
// browser only, after mount. The planet table below keeps the same data
// readable without the SVG (accessibility) and if the wheel fails to load.
// Theme: AstroChart's 4th constructor argument overrides its white/black
// defaults (COLOR_BACKGROUND, POINTS_COLOR, SIGNS_COLOR, CIRCLE_COLOR,
// LINE_COLOR, CUSPS_FONT_COLOR, SYMBOL_AXIS_FONT_COLOR). Sign glyph
// colours stay the library defaults; text, circles and lines go gold/cream
// to match Sortes. Wheel glyph hover is library-controlled, so planet
// highlight lives in the table below, not by hacking the library DOM.
const WHEEL_THEME = {
  COLOR_BACKGROUND: "#1a1f2e",
  POINTS_COLOR: "#ede6d6",
  SIGNS_COLOR: "#f4d03f",
  CIRCLE_COLOR: "#d4af37",
  LINE_COLOR: "#d4af37",
  CUSPS_FONT_COLOR: "#ede6d6",
  SYMBOL_AXIS_FONT_COLOR: "#f4d03f",
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
        <div id={elementId} className="mx-auto w-full max-w-[600px]" />
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
      <p className="mt-4 text-sm text-cream/60">
        Chart only, for reflection. No interpretation is included in Phase 1, and no reading is charged or saved.
      </p>
    </div>
  );
}

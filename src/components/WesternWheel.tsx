"use client";

import { useEffect, useState } from "react";
import CustomWesternWheel from "@/components/CustomWesternWheel";
import { motion, useReducedMotion } from "framer-motion";
import type { WesternResult } from "@/lib/charts";

// Custom wheel (Audit 5): AstroChart could not stagger planet labels
// inside its SVG, so the dense Capricorn cluster stacked on the wheel
// itself. CustomWesternWheel draws the same WesternResult positions
// (Ascendant left, zodiac counter-clockwise, cusp lines, sign ring)
// with staggered labels and leader lines on the wheel. Chart math is
// unchanged; the planet table below remains the exact primary.
export default function WesternWheel({ result }: { result: WesternResult }) {
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
      <p className="mt-1 text-sm text-cream/80">Exact positions, signs, and houses. The wheel below is a visual overview; clustered planet labels are staggered on the wheel itself with leader lines, so they do not stack.</p>
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
              <td className="num py-2 pr-4">{p.longitude.toFixed(2)}°</td>
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
      <p className="mt-1 text-sm text-cream/80">Visual overview. Clustered planet labels are staggered on the wheel with leader lines; the planet table above is still the exact reading.</p>
      <motion.div
        initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
        className="mt-6 overflow-x-auto rounded-2xl border border-gold/25 bg-panel/70 p-4"
      >
        <div className="mx-auto w-full overflow-x-auto">
          <CustomWesternWheel result={result} theme={wheelTheme} />
        </div>
      </motion.div>
      <p className="mt-4 text-sm text-cream/80">
        Chart only, for reflection. Calculation is free and unsaved; interpretation, when you choose it below, is a separate step.
      </p>
    </div>
  );
}

"use client";

import type { VedicResult } from "@/lib/vedic";

// Vedic D1 chart display: sidereal Lahiri positions, whole-sign houses,
// Moon nakshatra, and the current Vimshottari dasha. Calculation only in
// this component; interpretation lives in the charts page, below.
export default function VedicChart({ result }: { result: VedicResult }) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
        <span>
          Sun: <strong className="text-cream">{result.sunSign}</strong>
        </span>
        <span>
          Moon: <strong className="text-cream">{result.moonSign}</strong>
        </span>
        <span>
          Rising: <strong className="text-cream">{result.ascendantSign}</strong>
        </span>
        <span>
          Moon nakshatra: <strong className="text-cream">{result.moonNakshatra}</strong>, pada {result.moonNakshatraPada}, lord {result.moonNakshatraLord}
        </span>
        <span>
          Current Vimshottari dasha ({result.dashaAsOf}): <strong className="text-cream">{result.currentDasha}</strong>
        </span>
        {result.unknownTime && (
          <span className="text-goldbright">Unknown birth time: calculated at noon, Rising and houses are approximate.</span>
        )}
      </div>
      <p className="mt-2 text-sm text-cream/80">
        Sidereal Lahiri, whole-sign houses. Birth time is converted to UT with a longitude offset only, no timezone database and no DST, so a chart near a sign or nakshatra cusp may differ by one division.
      </p>
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
              <tr key={p.name} className="border-b border-gold/10">
                <td className="py-2 pr-4 font-semibold capitalize text-cream">{p.name}</td>
                <td className="py-2 pr-4">{p.sign}</td>
                <td className="py-2 pr-4">{p.longitude.toFixed(2)}°</td>
                <td className="py-2">{p.house ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-cream/80">
        Chart only, for reflection. Calculation is free and unsaved; interpretation, when you choose it below, is a separate step.
      </p>
    </div>
  );
}

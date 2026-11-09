"use client";

import type { VedicResult } from "@/lib/vedic";
import VedicDiamondChart from "@/components/VedicDiamondChart";
import { formatUtcOffset } from "@/lib/format-offset";
import ScrollableRegion from "@/components/ScrollableRegion";

// Vedic D1 chart display (sidereal Lahiri, whole-sign houses).
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
        {result.ascendantSign && (
          <span>
            Rising: <strong className="text-cream">{result.ascendantSign}</strong>
          </span>
        )}
        <span>
          Moon nakshatra: <strong className="text-cream">{result.moonNakshatra}</strong>, pada {result.moonNakshatraPada}, lord {result.moonNakshatraLord}
        </span>
        <span>
          Current Vimshottari dasha ({result.dashaAsOf}): <strong className="text-cream">{result.currentDasha}</strong>
          {result.currentPratyantar && (
            <> (pratyantar {result.currentPratyantar.lord}, {result.currentPratyantar.start} to {result.currentPratyantar.end})</>
          )}
        </span>
        {result.unknownTime && (
          <span className="text-goldbright">Unknown birth time: planet positions use noon as a stand-in. Rising and houses are withheld, not estimated.</span>
        )}
      </div>
      <p className="mt-2 text-sm text-cream/80">
        Sidereal Lahiri, whole-sign houses. Ayanamsa for this birth date: {result.ayanamsaDegrees.toFixed(4)}° (Lahiri, from caelus). Only the D9 Navamsa and D10 Dasamsa divisional charts are offered.{" "}
        {result.timeBasis === "iana"
          ? `Birth time was converted to UT with ${result.timeZone ?? ""} (${formatUtcOffset(result.utcOffsetMinutes)}), including daylight saving for the birth date.`
          : "No timezone could be resolved for these coordinates, so birth time was converted to UT with a longitude offset only, no timezone database and no DST, so a chart near a sign or nakshatra cusp may differ by one division."}
      </p>
      <ScrollableRegion label="Planet table, scroll sideways to see all columns" className="mt-4 overflow-x-auto">
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
                <td className="py-2 pr-4 font-semibold capitalize text-cream">{p.name}{p.retrograde ? " · retrograde" : ""}</td>
                <td className="py-2 pr-4">{p.sign}</td>
                <td className="num py-2 pr-4">{p.longitude.toFixed(2)}°</td>
                <td className="py-2">{p.house ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollableRegion>
      <p className="mt-1 text-right text-xs text-mist sm:hidden">Scroll sideways to see more</p>
      {/* Phase 4B (4.2d): North Indian diamond chart from the computed
          placements. Withheld, honestly, when the birth time is
          unknown: the diamond is drawn around the Lagna and houses. */}
      {result.ascendantSign ? (
        <>
          <h3 className="mt-8 font-display text-xl text-goldbright">Diamond chart</h3>
          <p className="mt-1 text-sm text-cream/80">
            North Indian diamond: the Lagna is the top diamond, marked Lg, and houses run counter-clockwise from it.
            Planets are listed by house; the table above is the exact list.
          </p>
          <div className="mt-4">
            <VedicDiamondChart result={result} />
          </div>
        </>
      ) : (
        <p className="mt-8 rounded-2xl border border-gold/25 bg-panel/70 p-4 text-sm text-cream/80">
          No diamond chart without a birth time: the diamond is drawn around the Lagna and houses, which are withheld
          for unknown-time charts. The planet table above is the full chart.
        </p>
      )}
      <details className="mt-4 scroll-mt-24 rounded-2xl border border-gold/25 bg-panel/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">
          Navamsa (D9) and Dasamsa (D10) (tap to list)
        </summary>
        <p className="mt-2 text-sm text-cream/75">
          Divisional charts from the same natal positions, by the Parashara rules stated on
          the methodology page. D9 refines the Moon chart themes; D10 refines career themes.
          {result.divisional.lagnaD9
            ? ` D9 Lagna: ${result.divisional.lagnaD9}. D10 Lagna: ${result.divisional.lagnaD10}.`
            : " Divisional Lagnas are withheld: the birth time is unknown."}
        </p>
        <ScrollableRegion label="Navamsa (D9) and Dasamsa (D10) table, scroll sideways to see all columns">
          <table className="min-w-[420px] w-full text-left text-sm text-cream/85">
            <thead>
              <tr className="border-b border-gold/25 text-cream/80">
                <th className="py-2 pr-4">Planet</th>
                <th className="py-2 pr-4">D9 sign</th>
                <th className="py-2 pr-4">D10 sign</th>
              </tr>
            </thead>
            <tbody>
              {result.divisional.planets.map((p) => (
                <tr key={p.name} className="border-b border-gold/10">
                  <td className="py-2 pr-4 font-semibold capitalize text-cream">{p.name}</td>
                  <td className="py-2 pr-4">
                    {p.d9}
                    {p.d9House !== null && ` (house ${p.d9House} from D9 Lagna)`}
                  </td>
                  <td className="py-2 pr-4">
                    {p.d10}
                    {p.d10House !== null && ` (house ${p.d10House} from D10 Lagna)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableRegion>
        <p className="mt-1 text-right text-xs text-mist sm:hidden">Scroll sideways to see more</p>
        <p className="mt-2 text-xs text-mist">On a narrow screen, scroll the table sideways to see all columns.</p>
      </details>
      <details className="mt-4 scroll-mt-24 rounded-2xl border border-gold/25 bg-panel/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">
          Yogas (tap to list)
        </summary>
        {result.unknownTime ? (
          <p className="mt-2 text-sm text-cream/85">Yogas need a birth time: the kendras are counted from the Ascendant, which is withheld without one.</p>
        ) : result.yogas.length === 0 ? (
          <p className="mt-2 text-sm text-cream/85">No classical yogas from the named set were found in this chart. Only yogas computed from your positions are listed; none are invented.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-cream/85">
            {result.yogas.map((y) => (
              <li key={y.name}>
                <strong className="text-cream">{y.name}.</strong> {y.detail}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-mist">Named yogas only: Pancha Mahapurusha, Gajakesari, Budha-Aditya, Chandra-Mangala, Kemadruma, raja and dhana yogas by lordship and association, and the yogakaraka. Ashtakavarga is computed separately, below.</p>
      </details>
      <details className="mt-4 scroll-mt-24 rounded-2xl border border-gold/25 bg-panel/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">
          Ashtakavarga (tap to list)
        </summary>
        {result.unknownTime || !result.ashtakavarga ? (
          <p className="mt-2 text-sm text-cream/85">Ashtakavarga needs a birth time: the bindus are counted per house, and houses are counted from the Ascendant, which is withheld without one.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-cream/85">
              Sarvashtakavarga, bindus per house (1st to 12th): {result.ashtakavarga.sav.join(", ")}. Total {result.ashtakavarga.total} of 337.
              Each planet&apos;s own bindus in the sign it occupies:{" "}
              {Object.entries(result.ashtakavarga.natalBindus).map(([p, n]) => `${p.charAt(0).toUpperCase() + p.slice(1)} ${n}`).join(", ")} (4 is the neutral point).
            </p>
            <ScrollableRegion label="Ashtakavarga table, scroll sideways to see all columns">
              <table className="min-w-[520px] w-full text-left text-sm text-cream/85">
                <thead>
                  <tr className="border-b border-gold/25 text-cream/80">
                    <th className="py-2 pr-4">House</th>
                    <th className="py-2 pr-4">Sun</th>
                    <th className="py-2 pr-4">Moon</th>
                    <th className="py-2 pr-4">Mars</th>
                    <th className="py-2 pr-4">Mercury</th>
                    <th className="py-2 pr-4">Jupiter</th>
                    <th className="py-2 pr-4">Venus</th>
                    <th className="py-2 pr-4">Saturn</th>
                    <th className="py-2">All</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ashtakavarga.sav.map((sav, i) => (
                    <tr key={i} className="border-b border-gold/10">
                      <td className="py-2 pr-4">{i + 1}</td>
                      <td className="py-2 pr-4">{result.ashtakavarga!.bav.sun[i]}</td>
                      <td className="py-2 pr-4">{result.ashtakavarga!.bav.moon[i]}</td>
                      <td className="py-2 pr-4">{result.ashtakavarga!.bav.mars[i]}</td>
                      <td className="py-2 pr-4">{result.ashtakavarga!.bav.mercury[i]}</td>
                      <td className="py-2 pr-4">{result.ashtakavarga!.bav.jupiter[i]}</td>
                      <td className="py-2 pr-4">{result.ashtakavarga!.bav.venus[i]}</td>
                      <td className="py-2 pr-4">{result.ashtakavarga!.bav.saturn[i]}</td>
                      <td className="py-2 font-semibold text-cream">{sav}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableRegion>
            <p className="mt-1 text-right text-xs text-mist sm:hidden">Scroll sideways to see more</p>
            <p className="mt-2 text-xs text-mist">Unreduced BAV only (no Trikona/Ekadhipatya reductions, no Shodhya Pinda). Read as relative strength: more than 30 bindus is traditionally strong, 25 to 30 middling, fewer than 25 weak, with the 6th, 8th and 12th houses read the other way round. Tables follow Raman Ch. XXVI with the three BPHS recension entries noted on the methodology page; the full grid is verified against a published sample chart.</p>
          </>
        )}
      </details>
      <details className="mt-4 scroll-mt-24 rounded-2xl border border-gold/25 bg-panel/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">
          Mahadasha timeline (tap to list)
        </summary>
        <ul className="mt-2 space-y-1 text-sm text-cream/85">
          {result.dashaTimeline.map((t) => (
            <li key={`${t.lord}-${t.start}`}>
              {t.lord}: {t.start} to {t.end}
              {result.currentAntardasha && result.currentAntardasha.start >= t.start && result.currentAntardasha.start < t.end
                ? ` (current antardasha: ${result.currentAntardasha.lord}, ${result.currentAntardasha.start} to ${result.currentAntardasha.end})`
                : ""}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-4 text-sm text-cream/80">
        Chart only, for reflection. Calculation is free and unsaved; interpretation, when you choose it below, is a separate step.
      </p>
    </div>
  );
}

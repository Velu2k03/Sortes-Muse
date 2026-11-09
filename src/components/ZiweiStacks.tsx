"use client";

import { useState } from "react";
import Link from "next/link";
import ScrollableRegion from "@/components/ScrollableRegion";

// M3.3: palace activation stacks for a Ziwei chart already
// calculated on the page. Calculation only: free, unsaved, no
// credits. Palace names are English, star names stay Chinese, the
// same mixed convention as the natal chart in English mode. Si Hua
// pairs are shown in Lu, Quan, Ke, Ji order, straight from the
// engine's table for each layer's stem.
const SIHUA_LABELS = ["禄", "权", "科", "忌"];

interface StackRow {
  index: number;
  name: string;
  chineseName: string;
  natalMajorStars: string[];
  decadeStars: string[];
  annualStars: string[];
  decadeActive: boolean;
  annualActive: boolean;
}

interface Layer {
  palaceName: string;
  palaceNameZh: string;
  index: number;
  heavenlyStem: string;
  earthlyBranch: string;
  mutagen: string[];
}

interface StacksData {
  year: number;
  coveredYears: [number, number];
  decade: Layer & { ageRange: [number, number]; yearRange: [number, number] };
  annual: Layer;
  daily: Layer;
  dailyDate: string;
  stacks: StackRow[];
}

function localYear(): number {
  return new Date().getFullYear();
}

function sihua(mutagen: string[]): string {
  return mutagen.map((s, i) => `${s}${SIHUA_LABELS[i] ?? ""}`).join(" · ");
}

export default function ZiweiStacks({
  date,
  hour,
  minute,
  gender,
  longitude,
  latitude,
  timeZone,
}: {
  date: string;
  hour: number;
  minute: number;
  gender: "male" | "female";
  longitude: number;
  // Phase 4B (4.3): latitude and the user's timezone override, so the
  // stacks use the same IANA conversion as the natal chart. Both are
  // optional; without them the stacks keep the longitude-only path.
  latitude?: number;
  timeZone?: string;
}) {
  const [year, setYear] = useState(localYear());
  const [data, setData] = useState<StacksData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onShow() {
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const res = await fetch("/api/chart/ziwei-stacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, hour, minute, gender, longitude, latitude, timeZone, year, today: todayStr }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not calculate palace stacks.");
        return;
      }
      setData(json as StacksData);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/70 p-6" aria-label="Palace activation stacks">
      <h3 className="font-display text-2xl text-goldbright">Palace activation stacks</h3>
      <p className="mt-2 text-sm leading-relaxed text-cream/75">
        Three layers over the same twelve palaces: your natal stars, the decade layer for
        the chosen year, and the annual layer for that year. A palace is activated when a
        layer&apos;s palace falls on it. Free, unsaved, and no birth data leaves this page
        for it.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="Stack year"
          className="rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={onShow}
          disabled={loading || !Number.isInteger(year)}
          className="btn-gold rounded-xl px-6 py-3 font-bold disabled:opacity-100 disabled:saturate-50"
        >
          {loading ? "Calculating…" : "Show stacks"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {data && (
        <div className="mt-6">
          <div className="space-y-3 text-sm text-cream/85">
            <p>
              <strong className="text-cream">Decade: </strong>
              {data.decade.palaceName} ({data.decade.palaceNameZh}), ages {data.decade.ageRange[0]} to {data.decade.ageRange[1]}, years {data.decade.yearRange[0]} to {data.decade.yearRange[1]}, stem {data.decade.heavenlyStem}{data.decade.earthlyBranch}.
              {" "}Si Hua: {sihua(data.decade.mutagen)}.
            </p>
            <p>
              <strong className="text-cream">Annual {data.year}: </strong>
              {data.annual.palaceName} ({data.annual.palaceNameZh}), stem {data.annual.heavenlyStem}{data.annual.earthlyBranch}.
              {" "}Si Hua: {sihua(data.annual.mutagen)}.
            </p>
            <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 leading-relaxed">
              <strong className="text-cream">Daily rhythm ({data.dailyDate}): </strong>
              {data.daily.palaceName} ({data.daily.palaceNameZh}), stem {data.daily.heavenlyStem}{data.daily.earthlyBranch}.
              {" "}Si Hua: {sihua(data.daily.mutagen)}.
              {" "}This layer changes every day, so it is rhythm, not a personal reading: no
              interpretation is attached to it.
            </p>
          </div>
          <ScrollableRegion
            label="Palace activation stacks table, scroll sideways to see all columns"
            className="mt-4 overflow-x-auto"
          >
            <table className="min-w-[560px] w-full text-left text-sm text-cream/85">
              <thead>
                <tr className="border-b border-gold/25 text-cream/80">
                  <th className="py-2 pr-4">Palace</th>
                  <th className="py-2 pr-4">Natal major stars</th>
                  <th className="py-2 pr-4">Decade stars</th>
                  <th className="py-2 pr-4">Annual stars</th>
                </tr>
              </thead>
              <tbody>
                {data.stacks.map((row) => (
                  <tr key={row.index} className="border-b border-gold/10">
                    <td className="py-2 pr-4 font-semibold text-cream">
                      {row.name} ({row.chineseName})
                      {row.decadeActive && <span className="text-goldbright"> · decade palace</span>}
                      {row.annualActive && <span className="text-goldbright"> · annual palace</span>}
                    </td>
                    <td className="py-2 pr-4">{row.natalMajorStars.join(", ") || "—"}</td>
                    <td className="py-2 pr-4">{row.decadeStars.join(", ") || "—"}</td>
                    <td className="py-2 pr-4">{row.annualStars.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableRegion>
          <p className="mt-2 text-xs text-mist">On a narrow screen, scroll the table sideways to see all columns.</p>
          <p className="mt-4 text-xs leading-relaxed text-mist">
            Stacks are computed by the iztro engine from the same natal chart, using its own
            decade ranges and Si Hua table for each layer&apos;s stem. Decades use nominal
            ages. Years shown cover {data.coveredYears[0]} to {data.coveredYears[1]}; a year
            outside that range is refused rather than stacked from the wrong decade.{" "}
            <Link href="/methodology" className="font-semibold text-goldbright underline">
              How we calculate this
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

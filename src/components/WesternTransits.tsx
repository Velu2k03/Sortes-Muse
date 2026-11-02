"use client";

import { useState } from "react";
import Link from "next/link";
import type { WesternPlanet } from "@/lib/charts";

// M3.1: transit-to-natal horoscope for a Western chart already
// calculated on the page. Calculation only: free, unsaved, no
// credits. The aspect glosses are generic for the aspect type, not
// predictions about the seeker, and the page says so.
const ASPECT_GLOSS: Record<string, string> = {
  conjunction: "A meeting of energies: this theme is at its most direct.",
  sextile: "An easy opening: support is available if you reach for it.",
  square: "Friction that asks for a choice: pressure here points at what needs adjusting.",
  trine: "Flow: this theme moves more easily than usual.",
  opposition: "Polarity: two pulls in tension, worth holding both sides of before deciding.",
};

const STATE_WORD: Record<string, string> = {
  applying: "building",
  separating: "easing",
  steady: "holding",
};

interface TransitAspect {
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
  orb: number;
  state: string;
}

interface TransitData {
  date: string;
  moonSign: string;
  aspects: TransitAspect[];
  transitPlanets: Array<{ name: string; longitude: number; sign: string; retrograde: boolean }>;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WesternTransits({
  planets,
  unknownTime,
}: {
  planets: WesternPlanet[];
  unknownTime: boolean;
}) {
  const [date, setDate] = useState(localToday());
  const [data, setData] = useState<TransitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onShow() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chart/transits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          natalPlanets: planets.map((p) => ({ name: p.name, longitude: p.longitude })),
          date,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not calculate transits.");
        return;
      }
      setData(json as TransitData);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/70 p-6" aria-label="Today's transits">
      <h3 className="font-display text-2xl text-goldbright">Today&apos;s transits to this chart</h3>
      <p className="mt-2 text-sm leading-relaxed text-cream/75">
        Real planetary positions for the date below, matched against your natal planets by
        aspect. This is a transit-to-natal reading, not sun-sign copy: it changes as the
        planets move. Free, unsaved, and no birth data leaves this page for it.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Transit date"
          className="rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={onShow}
          disabled={loading || !date}
          className="btn-gold rounded-xl px-6 py-3 font-bold disabled:opacity-40"
        >
          {loading ? "Calculating…" : "Show transits"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {data && (
        <div className="mt-6">
          <p className="text-sm text-cream/85">
            Transiting Moon in <strong className="text-cream">{data.moonSign}</strong> on {data.date}.
          </p>
          {unknownTime && (
            <p className="mt-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-cream/85">
              Your birth time is unknown, so your natal Moon longitude uses a noon stand-in and
              can be off by up to about 6 degrees. Moon lines below are approximate; other
              planets move slowly enough that the stand-in barely matters for them.
            </p>
          )}
          {data.aspects.length === 0 ? (
            <p className="mt-4 text-sm text-cream/75">
              No major transit aspects within orb on this date. That is not a verdict, just a
              quiet sky for these pairs.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {data.aspects.map((a, i) => {
                const involvesMoon = a.transitPlanet === "Moon" || a.natalPlanet === "Moon";
                return (
                  <li key={i} className="rounded-2xl border border-gold/15 bg-panel/50 p-4">
                    <p className="text-sm font-semibold text-cream">
                      Transiting {a.transitPlanet} {a.aspect} natal {a.natalPlanet}
                      {" · "}orb {a.orb}° · {STATE_WORD[a.state] ?? a.state}
                      {unknownTime && involvesMoon && (
                        <span className="text-goldbright"> · approx.</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-cream/75">
                      {ASPECT_GLOSS[a.aspect] ?? ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-mist">
            Positions are geocentric, computed for 12:00 UTC on the chosen date. The Moon moves
            fastest, so same-day Moon aspects are approximate. Houses and angles are not used:
            transits here are longitude to longitude only. Aspect glosses are generic for the
            aspect type, not predictions about you.{" "}
            <Link href="/methodology" className="font-semibold text-goldbright underline">
              How we calculate this
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

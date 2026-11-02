"use client";

import { useState } from "react";
import Link from "next/link";
import type { VedicPlanet } from "@/lib/vedic";

// M3.2: Vedic Gochara plus panchanga for a Vedic chart already
// calculated on the page. Calculation only: free, unsaved, no
// credits. Positions and sign aspects only: this view deliberately
// attaches no favorable or unfavorable verdict to any transit.
interface GocharaAspect {
  natalPlanet: string;
  housesAway: number;
}

interface GocharaPlanet {
  name: string;
  longitude: number;
  sign: string;
  houseFromMoon: number;
  aspects: GocharaAspect[];
}

interface GocharaData {
  date: string;
  panchanga: {
    tithi: string;
    paksha: string;
    nakshatra: string;
    yoga: string;
    karana: string;
    vara: string;
  };
  planets: GocharaPlanet[];
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ord(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export default function VedicTransits({
  moonLongitude,
  planets,
  unknownTime,
}: {
  moonLongitude: number;
  planets: VedicPlanet[];
  unknownTime: boolean;
}) {
  const [date, setDate] = useState(localToday());
  const [data, setData] = useState<GocharaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onShow() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chart/vedic-transits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          natalMoonLongitude: moonLongitude,
          natalPlanets: planets.map((p) => ({ name: p.name, longitude: p.longitude })),
          date,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not calculate Gochara.");
        return;
      }
      setData(json as GocharaData);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/70 p-6" aria-label="Gochara and panchanga">
      <h3 className="font-display text-2xl text-goldbright">Gochara and panchanga</h3>
      <p className="mt-2 text-sm leading-relaxed text-cream/75">
        Transit planets for the date below, counted in signs from your natal Moon, with the
        sign-based aspects they cast on your natal planets. This is the Vedic transit view:
        positions and aspects only, no good-or-bad verdicts. Free, unsaved, and no birth data
        leaves this page for it.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Gochara date"
          className="rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={onShow}
          disabled={loading || !date}
          className="btn-gold rounded-xl px-6 py-3 font-bold disabled:opacity-40"
        >
          {loading ? "Calculating…" : "Show Gochara"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {data && (
        <div className="mt-6">
          <div className="rounded-2xl border border-gold/15 bg-panel/50 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              Panchanga · {data.date} · {data.panchanga.vara}
            </p>
            <p className="mt-2 text-sm text-cream/85">
              Tithi: <strong className="text-cream">{data.panchanga.paksha} {data.panchanga.tithi}</strong>
              {" · "}Moon nakshatra: <strong className="text-cream">{data.panchanga.nakshatra}</strong>
              {" · "}Yoga: <strong className="text-cream">{data.panchanga.yoga}</strong>
              {" · "}Karana: <strong className="text-cream">{data.panchanga.karana}</strong>
            </p>
          </div>
          {unknownTime && (
            <p className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-cream/85">
              Your birth time is unknown, so your natal Moon sign uses a noon stand-in. Houses
              from the Moon below are counted from that stand-in sign, so treat them as
              approximate; other planets move slowly enough that the stand-in barely matters
              for their signs.
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {data.planets.map((t) => (
              <li key={t.name} className="rounded-2xl border border-gold/15 bg-panel/50 p-4">
                <p className="text-sm font-semibold text-cream">
                  <span className="capitalize">{t.name}</span> transiting {t.sign}
                  {" · "}{ord(t.houseFromMoon)} from your natal Moon
                </p>
                {t.aspects.length > 0 ? (
                  <p className="mt-1 text-sm leading-relaxed text-cream/75">
                    Aspects:{" "}
                    {t.aspects
                      .map((a) => `natal ${a.natalPlanet} (${ord(a.housesAway)} sign)`)
                      .join(", ")}
                    .
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-cream/75">
                    No sign-based aspect on your natal planets.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-mist">
            Transit positions are sidereal Lahiri, computed for 12:00 UTC on the chosen date.
            Aspects are Graha Drishti counted in signs, with no orbs: every planet aspects the
            7th sign from itself, Mars adds the 4th and 8th, Jupiter the 5th and 9th, Saturn
            the 3rd and 10th, and the nodes aspect by the 7th sign only here. This view rates
            no transit as good or bad.{" "}
            <Link href="/methodology" className="font-semibold text-goldbright underline">
              How we calculate this
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

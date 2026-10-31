"use client";

import { useEffect, useState } from "react";
import type { WesternResult, ZiweiResult } from "@/lib/charts";
import type { ZiweiLanguage } from "@/lib/ziwei-i18n";
import ZiweiChartBoard from "@/components/ZiweiChartBoard";
import WesternWheel from "@/components/WesternWheel";

type ChartResult = ZiweiResult | WesternResult;

const inputClass =
  "w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-medium text-cream";

const PRESETS: { label: string; latitude: number; longitude: number }[] = [
  { label: "Manila, Philippines", latitude: 14.5995, longitude: 120.9842 },
  { label: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { label: "Kuala Lumpur, Malaysia", latitude: 3.139, longitude: 101.6869 },
  { label: "Jakarta, Indonesia", latitude: -6.2088, longitude: 106.8456 },
  { label: "Bangkok, Thailand", latitude: 13.7563, longitude: 100.5018 },
  { label: "Hong Kong", latitude: 22.3193, longitude: 114.1694 },
  { label: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503 },
  { label: "London, UK", latitude: 51.5074, longitude: -0.1278 },
  { label: "New York, USA", latitude: 40.7128, longitude: -74.006 },
  { label: "Los Angeles, USA", latitude: 34.0522, longitude: -118.2437 },
  { label: "Sydney, Australia", latitude: -33.8688, longitude: 151.2093 },
];

export default function ChartsClient() {
  const [system, setSystem] = useState<"ziwei" | "western">("ziwei");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [unknownTime, setUnknownTime] = useState(false);
  const [gender, setGender] = useState<"male" | "female">("female");
  const [preset, setPreset] = useState(PRESETS[0].label);
  const [latitude, setLatitude] = useState(String(PRESETS[0].latitude));
  const [longitude, setLongitude] = useState(String(PRESETS[0].longitude));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ChartResult | null>(null);
  // Ziwei language only; Western and Tarot are already English.
  // Default English for western clients; saved choice restores on return.
  const [ziweiLang, setZiweiLang] = useState<ZiweiLanguage>("en");
  useEffect(() => {
    const saved = window.localStorage.getItem("sortes-ziwei-lang");
    if (saved === "en" || saved === "zh") setZiweiLang(saved);
  }, []);
  function setZiweiLangSaved(lang: ZiweiLanguage) {
    setZiweiLang(lang);
    window.localStorage.setItem("sortes-ziwei-lang", lang);
  }

  function useExample() {
    setDate("1990-01-01");
    setTime("08:00");
    setUnknownTime(false);
    setPreset(PRESETS[0].label);
    setLatitude(String(PRESETS[0].latitude));
    setLongitude(String(PRESETS[0].longitude));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!date) {
      setError("Please choose a birth date.");
      return;
    }
    let hour: number | null = null;
    let minute = 0;
    if (!unknownTime) {
      const parts = time.split(":");
      hour = Number(parts[0]);
      minute = Number(parts[1] ?? 0);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        setError("Please choose a valid birth time, or tick unknown time.");
        return;
      }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/chart/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          date,
          hour,
          minute,
          unknownTime,
          gender,
          latitude: system === "western" ? Number(latitude) : undefined,
          longitude: system === "western" ? Number(longitude) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not calculate this chart.");
      setResult(data.result as ChartResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not calculate this chart.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Birth Charts</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">Cast a birth chart</h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          Ziwei (Purple Star) and Western charts, calculation only in Phase 1. No interpretation, no credit charge, and
          nothing is saved to your journal yet.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-cream/60">
          Privacy: your birth date, time, and place are used in-memory for this calculation only. They are not stored
          in our database and are never sent to an AI model.
          {system === "ziwei" &&
            " Ziwei here uses clock-time double-hours only; true solar time correction by birthplace longitude is not applied in Phase 1."}
        </p>
      </div>

      <div className="mx-auto mt-8 flex max-w-md gap-3">
        {(["ziwei", "western"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSystem(s);
              setResult(null);
            }}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-bold ${
              system === s ? "btn-gold" : "border border-gold/40 text-goldbright"
            }`}
            aria-pressed={system === s}
          >
            {s === "ziwei" ? "Ziwei" : "Western"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mx-auto mt-8 max-w-xl rounded-3xl border border-gold/25 bg-panel/70 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="chart-date" className={labelClass}>
              Birth date
            </label>
            <input id="chart-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="chart-time" className={labelClass}>
              Birth time
            </label>
            <input
              id="chart-time"
              type="time"
              disabled={unknownTime}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-cream/80">
              <input type="checkbox" checked={unknownTime} onChange={(e) => setUnknownTime(e.target.checked)} />
              I do not know the birth time
            </label>
          </div>
          {system === "ziwei" && (
            <div>
              <label htmlFor="chart-gender" className={labelClass}>
                Gender
              </label>
              <select id="chart-gender" value={gender} onChange={(e) => setGender(e.target.value as "male" | "female")} className={inputClass}>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          )}
          {system === "western" && (
            <>
              <div>
                <label htmlFor="chart-place" className={labelClass}>
                  Birthplace
                </label>
                <select
                  id="chart-place"
                  value={preset}
                  onChange={(e) => {
                    const found = PRESETS.find((p) => p.label === e.target.value);
                    setPreset(e.target.value);
                    if (found) {
                      setLatitude(String(found.latitude));
                      setLongitude(String(found.longitude));
                    }
                  }}
                  className={inputClass}
                >
                  {PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                  <option value="Custom">Custom coordinates</option>
                </select>
              </div>
              <div>
                <label htmlFor="chart-lat" className={labelClass}>
                  Latitude
                </label>
                <input id="chart-lat" type="number" step="any" required value={latitude} onChange={(e) => setLatitude(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="chart-lon" className={labelClass}>
                  Longitude
                </label>
                <input id="chart-lon" type="number" step="any" required value={longitude} onChange={(e) => setLongitude(e.target.value)} className={inputClass} />
              </div>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" disabled={loading} className="btn-gold rounded-full px-6 py-3 text-sm font-bold disabled:opacity-50">
            {loading ? "Calculating…" : "Calculate chart"}
          </button>
          <button type="button" onClick={useExample} className="rounded-full border border-gold/40 px-6 py-3 text-sm font-bold text-goldbright">
            Use example: 1990-01-01, 08:00, Manila
          </button>
        </div>
      </form>

      {result && (
        <section className="mt-10" aria-live="polite">
          <h2 className="font-display text-3xl text-goldbright">{result.system === "ziwei" ? "Ziwei chart" : "Western chart"}</h2>
          {result.system === "ziwei" && (
            <div className="mt-4 flex gap-3" role="group" aria-label="Chart language">
              {(["en", "zh"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setZiweiLangSaved(l)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    ziweiLang === l ? "btn-gold" : "border border-gold/40 text-goldbright"
                  }`}
                  aria-pressed={ziweiLang === l}
                >
                  {l === "en" ? "English" : "中文"}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4">
            {result.system === "ziwei" ? (
              <ZiweiChartBoard key={`${result.solarDate}-${result.timeLabel}`} result={result} lang={ziweiLang} />
            ) : (
              // Key remounts the wheel (and clears a previous wheel error) on each new chart.
              <WesternWheel key={JSON.stringify(result)} result={result} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

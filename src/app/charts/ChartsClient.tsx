"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { WesternResult, ZiweiResult } from "@/lib/charts";
import type { VedicResult } from "@/lib/vedic";
import type { ZiweiLanguage } from "@/lib/ziwei-i18n";
import ZiweiChartBoard, { type ZiweiView } from "@/components/ZiweiChartBoard";
import WesternWheel from "@/components/WesternWheel";
import VedicChart from "@/components/VedicChart";
import { useAuth } from "@/components/AuthProvider";
import { chartFreeUsed, markChartFreeUsed, type ChartFreeSystem } from "@/lib/storage";
import { makeReading } from "@/lib/storage";
import { chartInterpretationCost } from "@/lib/chart-pricing";

type ChartResult = ZiweiResult | WesternResult | VedicResult;
type ChartSystem = "ziwei" | "western" | "vedic";

const FOCUS_AREAS = ["general", "love", "career", "finances", "academics", "health"] as const;

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
  const { credits, spend, persistReading } = useAuth();
  const [system, setSystem] = useState<ChartSystem>("ziwei");
  const [ziweiView, setZiweiView] = useState<ZiweiView>("ring");
  const [placeSearch, setPlaceSearch] = useState("");
  const [placeStatus, setPlaceStatus] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);
  const [focus, setFocus] = useState<(typeof FOCUS_AREAS)[number]>("general");
  const [question, setQuestion] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [interpFallback, setInterpFallback] = useState(false);
  const [interpLoading, setInterpLoading] = useState(false);
  const [interpError, setInterpError] = useState("");
  const [interpFree, setInterpFree] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
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

  async function lookupPlace() {
    if (!placeSearch.trim()) {
      setPlaceStatus("Type a place name first, for example a city.");
      return;
    }
    setPlaceBusy(true);
    setPlaceStatus("Looking up coordinates…");
    try {
      const res = await fetch(`/api/chart/geocode?q=${encodeURIComponent(placeSearch.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Place lookup failed.");
      setLatitude(String(data.latitude));
      setLongitude(String(data.longitude));
      setPreset("Custom");
      setPlaceStatus(`Found coordinates: ${data.latitude}, ${data.longitude}. The place name itself is not stored or sent to AI.`);
    } catch (err) {
      setPlaceStatus(err instanceof Error ? err.message : "Place lookup failed.");
    } finally {
      setPlaceBusy(false);
    }
  }

  function chartSummaryText(r: ChartResult): string {
    if (r.system === "ziwei") {
      const life = r.palaces.find((p) => p.isLifePalace);
      return `Ziwei chart. Life palace: ${life?.name ?? "—"} (${(life?.majorStars ?? []).join(", ") || "empty"}). Zodiac: ${r.zodiac}.`;
    }
    if (r.system === "vedic") {
      return `Vedic chart. Sun: ${r.sunSign}. Moon: ${r.moonSign}, ${r.moonNakshatra} pada ${r.moonNakshatraPada}. Rising: ${r.ascendantSign}.`;
    }
    return `Western chart. Sun: ${r.sunSign}. Rising: ${r.ascendantSign}. Midheaven: ${r.midheavenSign}.`;
  }

  async function onInterpret() {
    if (!result) return;
    setInterpError("");
    setInterpLoading(true);
    try {
      const free = chartInterpretationCost(chartFreeUsed(result.system as ChartFreeSystem)) === 0;
      if (!free) {
        if ((credits ?? 0) < 1) {
          throw new Error("You need 1 credit for this interpretation. The calculation above stays free. Top up from the Credits page.");
        }
        const ok = await spend(1);
        if (!ok) throw new Error("Could not spend 1 credit. Your balance was not changed by this page.");
      }
      const res = await fetch("/api/chart/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: result.system, chart: result, category: focus, question: question.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not interpret this chart.");
      setInterpretation(data.interpretation as string);
      setInterpFallback(Boolean(data.fallback));
      setInterpFree(free);
      if (free) markChartFreeUsed(result.system as ChartFreeSystem);
    } catch (err) {
      setInterpError(err instanceof Error ? err.message : "Could not interpret this chart.");
    } finally {
      setInterpLoading(false);
    }
  }

  async function onSaveChart() {
    if (!result || !interpretation) return;
    const reading = makeReading({
      spreadSlug: `chart-${result.system}`,
      spreadName: `${result.system === "ziwei" ? "Ziwei" : result.system === "vedic" ? "Vedic" : "Western"} chart`,
      cards: [],
      interpretation,
      aiGenerated: !interpFallback,
      category: focus,
      question: question.trim() || undefined,
      free: interpFree,
      chartSummary: chartSummaryText(result),
    });
    await persistReading(reading);
    setSaved(true);
  }

  async function onShareChart() {
    if (!shareRef.current || shareBusy) return;
    setShareBusy(true);
    try {
      const dataUrl = await toPng(shareRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: "#0a0e1a" });
      const a = document.createElement("a");
      a.download = "sortes-chart.png";
      a.href = dataUrl;
      a.click();
    } finally {
      setShareBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setInterpretation("");
    setInterpError("");
    setSaved(false);
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
          latitude: Number(latitude),
          longitude: Number(longitude),
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
          Ziwei (Purple Star), Western, and Vedic charts. Calculation is free and unsaved. Interpretation, when you
          choose it, is 1 credit per full chart reading, and your first chart per system is free.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-cream/60">
          Privacy: your birth date, time, and place are used in-memory for this calculation only. They are not stored
          in our database and are never sent to an AI model. The AI, when you ask for interpretation, receives only
          chart positions, signs, houses, and stars, plus your focus and question.
          {system === "ziwei" &&
            " Ziwei time is corrected by birthplace longitude only: correction = 4 minutes per degree from the nearest 15 degree timezone meridian. No timezone database, no DST, and no equation of time are applied, so a chart near a double-hour boundary may differ by one double-hour."}
        </p>
      </div>

      <div className="mx-auto mt-8 flex max-w-lg flex-wrap gap-3">
        {(["ziwei", "western", "vedic"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSystem(s);
              setResult(null);
              setInterpretation("");
              setInterpError("");
              setSaved(false);
            }}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-bold ${
              system === s ? "btn-gold" : "border border-gold/40 text-goldbright"
            }`}
            aria-pressed={system === s}
          >
            {s === "ziwei" ? "Ziwei" : s === "vedic" ? "Vedic" : "Western"}
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
          <div className="sm:col-span-2">
            <label htmlFor="chart-place-search" className={labelClass}>
              Or search a place name (free, no key)
            </label>
            <div className="flex gap-2">
              <input
                id="chart-place-search"
                type="text"
                value={placeSearch}
                onChange={(e) => setPlaceSearch(e.target.value)}
                placeholder="e.g. Santa Rosa City, Laguna"
                className={inputClass}
              />
              <button type="button" onClick={lookupPlace} disabled={placeBusy} className="shrink-0 rounded-xl border border-gold/40 px-4 py-3 text-sm font-bold text-goldbright disabled:opacity-50">
                {placeBusy ? "Searching…" : "Find"}
              </button>
            </div>
            {placeStatus && <p className="mt-2 text-sm text-cream/70">{placeStatus}</p>}
            <p className="mt-1 text-xs text-cream/50">
              The place name is used only for this lookup. Only its coordinates are kept for the calculation, and the
              place name is never stored and never sent to AI.
            </p>
          </div>
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
            <>
              <div className="mt-4 flex flex-wrap gap-3" role="group" aria-label="Chart language">
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
              <div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="Ziwei chart view">
                {(["ring", "square"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setZiweiView(v)}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      ziweiView === v ? "btn-gold" : "border border-gold/40 text-goldbright"
                    }`}
                    aria-pressed={ziweiView === v}
                  >
                    {v === "ring" ? "Circle chart" : "Traditional square"}
                  </button>
                ))}
              </div>
              {result.solarCorrectionMinutes !== 0 && (
                <p className="mt-3 text-sm text-cream/70">
                  Longitude correction applied: {result.solarCorrectionMinutes > 0 ? "+" : ""}
                  {result.solarCorrectionMinutes} minutes, corrected time {result.solarCorrectedTime}. Equation of time, DST, and historical timezones are not applied.
                </p>
              )}
            </>
          )}
          <div className="mt-4">
            {result.system === "ziwei" ? (
              <ZiweiChartBoard key={`${result.solarDate}-${result.timeLabel}`} result={result} lang={ziweiLang} view={ziweiView} />
            ) : result.system === "vedic" ? (
              <VedicChart result={result} />
            ) : (
              // Key remounts the wheel (and clears a previous wheel error) on each new chart.
              <WesternWheel key={JSON.stringify(result)} result={result} />
            )}
          </div>

          <section className="mt-10 rounded-3xl border border-gold/25 bg-panel/70 p-6" aria-label="Chart interpretation">
            <h3 className="font-display text-2xl text-goldbright">Interpretation</h3>
            <p className="mt-2 text-sm text-cream/75">
              Calculation above was free and unsaved. A full interpretation is{" "}
              <strong className="text-cream">
                {chartFreeUsed(result.system as ChartFreeSystem) ? "1 credit" : "free for your first chart in this system, then 1 credit"}
              </strong>
              . The AI receives only chart positions, signs, houses, and stars, plus your focus and question, never your birth date, time, or place.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="chart-focus" className={labelClass}>
                  Focus area
                </label>
                <select id="chart-focus" value={focus} onChange={(e) => setFocus(e.target.value as typeof focus)} className={inputClass}>
                  {FOCUS_AREAS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="chart-question" className={labelClass}>
                  Your question (optional)
                </label>
                <input id="chart-question" type="text" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What would you like clarity on?" className={inputClass} />
              </div>
            </div>
            {interpError && (
              <p role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {interpError}
              </p>
            )}
            <button type="button" onClick={onInterpret} disabled={interpLoading} className="btn-gold mt-5 rounded-full px-6 py-3 text-sm font-bold disabled:opacity-50">
              {interpLoading ? "Interpreting…" : chartFreeUsed(result.system as ChartFreeSystem) ? "Get interpretation (1 credit)" : "Get interpretation (free)"}
            </button>
            {interpretation && (
              <div className="mt-6">
                <p className="text-xs uppercase tracking-widest text-gold">
                  {interpFree ? "Free interpretation" : "1 credit interpretation"}
                  {interpFallback ? " · Prepared from chart positions" : " · Personalized"}
                </p>
                <p className="mt-3 whitespace-pre-wrap leading-relaxed text-cream/90">{interpretation}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={onSaveChart} disabled={saved} className="rounded-full border border-gold/40 px-5 py-2.5 text-sm font-bold text-goldbright disabled:opacity-50">
                    {saved ? "Saved to journal" : "Save to journal"}
                  </button>
                  <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-2.5 text-sm font-bold text-goldbright disabled:opacity-50">
                    {shareBusy ? "Creating image…" : "Share chart as image"}
                  </button>
                </div>
                {saved && <p className="mt-3 text-sm text-cream/70">Saved as positions only, never birth date, time, or place. Revisit it from your journal.</p>}
                <div aria-hidden="true" style={{ position: "fixed", left: "-10000px", top: 0, width: 1200, height: 630 }}>
                  <div ref={shareRef} style={{ width: 1200, height: 630, background: "#0a0e1a", color: "#ede6d6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, fontFamily: "Georgia, serif", border: "2px solid #d4af37" }}>
                    <div style={{ fontSize: 28, letterSpacing: 8, color: "#d4af37" }}>SORTES</div>
                    <div style={{ fontSize: 48, marginTop: 12 }}>{result.system === "ziwei" ? "Ziwei chart" : result.system === "vedic" ? "Vedic chart" : "Western chart"}</div>
                    <div style={{ fontSize: 24, marginTop: 24, maxWidth: 900, textAlign: "center" }}>{chartSummaryText(result)}</div>
                    <div style={{ fontSize: 18, marginTop: 24, color: "#9ca3af" }}>A reflection, not a prediction. tarot.resonantatlas.com</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}

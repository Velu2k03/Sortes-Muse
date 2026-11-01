"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { WesternResult, ZiweiResult } from "@/lib/charts";
import type { VedicResult } from "@/lib/vedic";
import type { ZiweiLanguage } from "@/lib/ziwei-i18n";
import { localizeStar, zodiacEn, ZIWEI_LEGEND_ZH } from "@/lib/ziwei-i18n";
import ThemedDatePicker from "@/components/ThemedDatePicker";
import CardBurst from "@/components/CardBurst";
import ZiweiChartBoard, { type ZiweiView } from "@/components/ZiweiChartBoard";
import WesternWheel from "@/components/WesternWheel";
import VedicChart from "@/components/VedicChart";
import { useAuth } from "@/components/AuthProvider";
import Icon from "@/components/Icon";
import { chartFreeUsed, markChartFreeUsed, makeReading, type ChartFreeSystem } from "@/lib/storage";
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
  // Traditional square is the default Ziwei view: it passed the re-audit
  // cleanly, while the ring edge labels still crowd and overlap. Ring
  // stays as an alternative toggle, it is not removed.
  const [ziweiView, setZiweiView] = useState<ZiweiView>("square");
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
  const [showBurst, setShowBurst] = useState(false);
  const resultRef = useRef<HTMLElement | null>(null);
  // Auto-scroll to the result after Calculate: it used to appear below
  // the form with no scroll, so users could think nothing happened.
  useEffect(() => {
    if (!result || !resultRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [result]);
  // Batch 9 magic, chart reveal only: a brief gold spark burst when
  // a chart is cast, the same CardBurst tarot uses on reveal, plus
  // the slow magic-glow on the result heading block. It fires once
  // per new result and unmounts after 1 second, it does not loop,
  // and CardBurst is pointer-events-none decoration.
  useEffect(() => {
    if (!result) return;
    setShowBurst(true);
    const t = setTimeout(() => setShowBurst(false), 1000);
    return () => clearTimeout(t);
  }, [result]);
  // Ziwei language only; Western and Tarot are already English.
  // Default English for western clients; saved choice restores on return.
  const [ziweiLang, setZiweiLang] = useState<ZiweiLanguage>("en");
  useEffect(() => {
    const saved = window.localStorage.getItem("sortes-ziwei-lang");
    // Re-audit root cause, part 1: a tester who had tapped Chinese in an
    // earlier session had "zh" saved, so a later session opened in
    // Chinese even though the code default is English. That persistence
    // is kept for a user who deliberately chose Chinese, but a new user
    // with no saved value stays English, and the form toggle below now
    // makes that choice visible before any chart is calculated.
    queueMicrotask(() => {
      if (saved === "en" || saved === "zh") setZiweiLang(saved);
      else window.localStorage.setItem("sortes-ziwei-lang", "en");
    });
  }, []);
  // Glosses toggle: default off in English, on in Chinese. Reset on
  // language change, so English mode is actually English in detail
  // (summary was already English, detail still showed Chinese
  // characters). ChartsClient owns it; ZiweiChartBoard renders it.
  const [showGlosses, setShowGlosses] = useState(false);
  function setZiweiLangSaved(lang: ZiweiLanguage) {
    setZiweiLang(lang);
    setShowGlosses(lang === "zh");
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

  // Ziwei summary must follow the chart language. The old summary used
  // raw Chinese values (life name, major stars, zodiac) in every language,
  // so an English user still read Chinese in the summary even after
  // tapping English, and "Life palace: Life" repeated the palace name.
  // English branch uses only the i18n map, no raw Chinese characters.
  function chartSummaryText(r: ChartResult, lang: ZiweiLanguage = "en"): string {
    if (r.system === "ziwei") {
      const life = r.palaces.find((p) => p.isLifePalace);
      const stars = life?.majorStars ?? [];
      if (lang === "zh") {
        return `紫微斗数。命宫：${stars.join("、") || "空宫"}。生肖：${r.zodiac}。`;
      }
      const enStars = stars.map((s) => localizeStar(s).en).join(", ") || "empty";
      return `Ziwei chart. Life: ${enStars}. Zodiac: ${zodiacEn(r.zodiac)}.`;
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
      chartSummary: chartSummaryText(result, ziweiLang),
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
          Ziwei, Western, and Vedic charts. Calculation is free.
          Interpretation is 1 credit, first per system free.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-cream/80">
          Birth data is used in memory only for this calculation. It is not
          stored, and AI gets only chart positions, never birth data.
          {system === "ziwei" &&
            " Ziwei time is corrected by longitude only: 4 minutes per degree from the nearest 15 degree meridian."}
        </p>
        {/* Audit 6: this long block used to sit above the form, so a
            first-time user had to scroll to the system tabs and the
            Use example button. It is now collapsed by default; the
            full text, including the timezone and privacy notes, is
            still one tap away, and the timezone disclosure below the
            form is untouched. */}
        <details className="mx-auto mt-4 max-w-xl rounded-2xl border border-gold/20 bg-panel/50 p-4 text-left text-sm leading-relaxed text-cream/75">
          <summary className="cursor-pointer font-semibold text-goldbright">How each system uses your inputs (tap for details)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Gender: Ziwei only, palace placement depends on it.</li>
            <li>Birthplace: all three systems. Western and Vedic need it for Rising and houses; Ziwei needs longitude for its correction.</li>
            <li>Birth time: clock time at the birthplace. No timezone database, no DST, so a time near a boundary may differ by one division. Unknown time is calculated at noon, Rising and houses approximate.</li>
            <li>Calculation is free and unsaved. Interpretation is separate: 1 credit, first per system free.</li>
          </ul>
        </details>
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
        {/* Audit 6: Use example lives at the top of the form, not only
            at its bottom, so it is visible without scrolling once the
            system tabs are on screen, on desktop and at 390px. */}
        <div className="mb-5">
          <button type="button" onClick={useExample} className="rounded-full border border-gold/40 px-6 py-3 text-sm font-bold text-goldbright">
            Use example: 1990-01-01, 08:00, Manila
          </button>
        </div>
        {system === "ziwei" && (
          <div className="mb-5">
            <span className={labelClass}>Chart language (English is the default)</span>
            <div role="group" className="mt-1 flex flex-wrap gap-3" aria-label="Chart language">
              {(["en", "zh"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setZiweiLangSaved(l)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${ziweiLang === l ? "btn-gold" : "border border-gold/40 text-goldbright"}`}
                  aria-pressed={ziweiLang === l}
                >
                  {l === "en" ? "English" : "中文"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-cream/80">This changes the chart labels, summary, and detail together. The form stays in English.</p>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="chart-date" className={labelClass}>
              Birth date
            </label>
            <ThemedDatePicker id="chart-date" value={date} onChange={setDate} />
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
            <p className="mt-1 text-xs text-cream/80">
              The place name is used only for this lookup. Only its coordinates are kept for the calculation, and the
              place name is never stored and never sent to AI.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm alert-error-text">
            {error}
          </p>
        )}
        <details className="mt-5 rounded-xl border border-gold/25 bg-panel/50 px-4 py-3 text-sm leading-relaxed text-cream/80">
          <summary className="cursor-pointer font-semibold text-goldbright">Before you calculate, please note: clock time at the birthplace, longitude-only conversion (tap for details)</summary>
          <p className="mt-2">
            Birth time is clock time at the birthplace. Conversion is longitude-only, no timezone database, no DST, no equation of time, so a time near a boundary may differ by one division. No timezone lookup is added.
          </p>
        </details>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" disabled={loading} className="btn-gold rounded-full px-6 py-3 text-sm font-bold disabled:opacity-50">
            {loading ? "Calculating…" : (<span className="inline-flex items-center gap-2"><Icon name="chart" size={18} />Calculate chart</span>)}
          </button>
        </div>
      </form>

      {result && (
        <section ref={resultRef} className="magic-glow relative mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/40 p-4 sm:p-6" aria-live="polite">
          {showBurst && <CardBurst count={24} distance={110} />}
          {/* Share card, result level: Audit 3 found the legend
              promising "share it as an image" with no Share button
              before interpretation, because the old share button only
              rendered after an interpretation existed. This offscreen
              card and the button below exist for every result, before
              interpretation, reusing chartSummaryText. */}
          <div aria-hidden="true" style={{ position: "fixed", left: "-10000px", top: 0, width: 1200, height: 630 }}>
            <div ref={shareRef} style={{ width: 1200, height: 630, background: "#0a0e1a", color: "#ede6d6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, fontFamily: "Georgia, serif", border: "2px solid #d4af37" }}>
              <div style={{ fontSize: 28, letterSpacing: 8, color: "#d4af37" }}>SORTES</div>
              <div style={{ fontSize: 48, marginTop: 12 }}>{result.system === "ziwei" ? "Ziwei chart" : result.system === "vedic" ? "Vedic chart" : "Western chart"}</div>
              <div style={{ fontSize: 24, marginTop: 24, maxWidth: 900, textAlign: "center" }}>{chartSummaryText(result, ziweiLang)}</div>
              <div style={{ fontSize: 18, marginTop: 24, color: "#9ca3af" }}>A reflection, not a prediction. sortes.resonantatlas.com</div>
            </div>
          </div>
          <h2 className="font-display text-3xl text-goldbright">
            {result.system === "ziwei" ? "Ziwei chart" : result.system === "vedic" ? "Vedic chart" : "Western chart"}
          </h2>
          <p className="mt-3 rounded-2xl border border-gold/25 bg-panel/70 px-4 py-3 text-sm leading-relaxed text-cream/90">
            <strong className="text-goldbright">Your chart in one line: </strong>
            {chartSummaryText(result, ziweiLang)}
          </p>
          {result.system === "ziwei" && (
            <>
              <p className="mt-3 text-sm text-cream/80">Chart language only: this toggle changes the chart labels, the form above stays in English.</p>
              <div role="group" className="mt-4 flex flex-wrap gap-3" aria-label="Chart language">
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
              <label className="mt-3 flex items-center gap-2 text-sm text-cream/80">
                <input type="checkbox" checked={showGlosses} onChange={(e) => setShowGlosses(e.target.checked)} />
                Show Chinese glosses (default off in English, on in Chinese)
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-2.5 text-sm font-bold text-goldbright disabled:opacity-50">
                  {shareBusy ? "Creating image…" : (<span className="inline-flex items-center gap-2"><Icon name="share" size={16} />Share chart as image</span>)}
                </button>
              </div>
              <div role="group" className="mt-3 flex flex-wrap gap-3" aria-label="Ziwei chart view">
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
          {result.system !== "ziwei" && (
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-2.5 text-sm font-bold text-goldbright disabled:opacity-50">
                {shareBusy ? "Creating image…" : (<span className="inline-flex items-center gap-2"><Icon name="share" size={16} />Share chart as image</span>)}
              </button>
            </div>
          )}
          <div className="mt-4">
            {result.system === "ziwei" ? (
              <ZiweiChartBoard key={`${result.solarDate}-${result.timeLabel}`} result={result} lang={ziweiLang} view={ziweiView} showGlosses={showGlosses} />
            ) : result.system === "vedic" ? (
              <VedicChart result={result} />
            ) : (
              // Key remounts the wheel (and clears a previous wheel error) on each new chart.
              <WesternWheel key={JSON.stringify(result)} result={result} />
            )}
          </div>

          <section className="mt-10 scroll-mt-24 rounded-3xl border border-gold/20 bg-panel/50 p-6" aria-label="Chart legend">
            <h3 className="font-display text-2xl text-goldbright">{result.system === "ziwei" && ziweiLang === "zh" ? "如何读这张星盘" : "How to read this chart"}</h3>
            <p className="mt-2 text-sm text-cream/75">
              {result.system === "ziwei" && ziweiLang === "zh"
                ? ZIWEI_LEGEND_ZH.intro
                : "Free legend. Start here if a word is new, then read your interpretation below."}
            </p>
            <div className="mt-4 grid gap-4 text-sm leading-relaxed text-cream/85 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-cream">Western, in plain words</p>
                <ul className="mt-2 space-y-1.5">
                  <li><strong className="text-goldbright">Sun:</strong> your core drive, the sign the Sun was in at birth.</li>
                  <li><strong className="text-goldbright">Moon:</strong> your inner life and emotional response.</li>
                  <li><strong className="text-goldbright">Rising:</strong> the sign rising on the eastern horizon at birth, how you meet the world.</li>
                  <li><strong className="text-goldbright">Midheaven:</strong> your public direction, work and reputation.</li>
                  <li><strong className="text-goldbright">Houses:</strong> 12 life areas, numbered 1 to 12, that a planet falls into.</li>
                  <li><strong className="text-goldbright">Aspects:</strong> angles between planets, listed in the collapsible list above.</li>
                </ul>
              </div>
              <div>
                {/* Audit 4: in Chinese mode the Ziwei legend is Chinese,
                    from ZIWEI_LEGEND_ZH, direct translations of the
                    English lines below. Western and Vedic legend lines
                    stay English in this batch, reported as remaining. */}
                {result.system === "ziwei" && ziweiLang === "zh" ? (
                  <>
                    <p className="font-semibold text-cream">{ZIWEI_LEGEND_ZH.heading}</p>
                    <ul className="mt-2 space-y-1.5">
                      {ZIWEI_LEGEND_ZH.palaces.map((p) => (
                        <li key={p.zh}><strong className="text-goldbright">{p.zh}：</strong>{p.desc}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-cream">Ziwei palaces, in plain words</p>
                    <ul className="mt-2 space-y-1.5">
                      <li><strong className="text-goldbright">Life:</strong> you, your body and your path.</li>
                      <li><strong className="text-goldbright">Siblings:</strong> brothers, sisters and close peers.</li>
                      <li><strong className="text-goldbright">Partner:</strong> close partnership and marriage.</li>
                      <li><strong className="text-goldbright">Children:</strong> children and creative output.</li>
                      <li><strong className="text-goldbright">Wealth:</strong> money, earning and spending.</li>
                      <li><strong className="text-goldbright">Health:</strong> body, habits and illness.</li>
                      <li><strong className="text-goldbright">Travel:</strong> movement, journeys and the wider world.</li>
                      <li><strong className="text-goldbright">Friends:</strong> friends, helpers and community.</li>
                      <li><strong className="text-goldbright">Career:</strong> work, role and public standing.</li>
                      <li><strong className="text-goldbright">Home:</strong> home, family and property.</li>
                      <li><strong className="text-goldbright">Fortune:</strong> ease, luck and inner contentment.</li>
                      <li><strong className="text-goldbright">Parents:</strong> parents, elders and roots.</li>
                    </ul>
                  </>
                )}
              </div>
              <div className="sm:col-span-2">
                <p className="font-semibold text-cream">Vedic, in plain words</p>
                <p className="mt-2">
                  Vedic uses sidereal signs, about 24 degrees behind Western tropical signs, whole-sign houses, the Moon
                  nakshatra, a lunar mansion with a pada, a quarter, and a lord, and the current Vimshottari dasha, a
                  planetary period. A star in a palace, or a planet in a sign, is a theme to reflect on, not a fixed
                  prediction.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-cream/75">
              {result.system === "ziwei" && ziweiLang === "zh" ? (
                <><strong className="text-goldbright">下一步：</strong>{ZIWEI_LEGEND_ZH.nextStep}</>
              ) : (
                <><strong className="text-goldbright">Next step: </strong>
                read your interpretation, save it, or share it. Calculation is free; interpretation is 1 credit, first per system free.</>
              )}
            </p>
          </section>

          <section className="mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/70 p-6" aria-label="Chart interpretation">
            <h3 className="font-display text-2xl text-goldbright">{result.system === "ziwei" && ziweiLang === "zh" ? "解读" : "Interpretation"}</h3>
            {result.system === "ziwei" && ziweiLang === "zh" && (
              <p className="mt-2 text-sm text-cream/80">解读由 AI 用英文生成，基于上方星盘位置；图表标签已为中文。</p>
            )}
            <p className="mt-2 text-sm text-cream/75">
              Calculation was free and unsaved. Interpretation is{" "}
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
              <p role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm alert-error-text">
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
                    {shareBusy ? "Creating image…" : (<span className="inline-flex items-center gap-2"><Icon name="share" size={16} />Share chart as image</span>)}
                  </button>
                </div>
                {saved && <p className="mt-3 text-sm text-cream/70">Saved as positions only, never birth data. See your journal.</p>}

              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}

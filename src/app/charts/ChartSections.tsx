"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ZIWEI_LEGEND_ZH } from "@/lib/ziwei-i18n";
import ThemedDatePicker from "@/components/ThemedDatePicker";
import { formatUtcOffset } from "@/lib/format-offset";
import CardBurst from "@/components/CardBurst";
// Phase 4C (4.8a): the chart renderers are code-split. Every one of
// them renders only after a chart is cast (behind `result`), so they
// are separate chunks loaded on demand instead of first-paint weight
// on the birth-data form. Plain dynamic() (SSR kept): these are
// client components rendered conditionally, so there is no SSR
// behaviour to preserve or lose, and no ssr:false is needed.
const ZiweiChartBoard = dynamic(() => import("@/components/ZiweiChartBoard"));
const WesternWheel = dynamic(() => import("@/components/WesternWheel"));
const WesternTransits = dynamic(() => import("@/components/WesternTransits"));
const VedicTransits = dynamic(() => import("@/components/VedicTransits"));
const ZiweiStacks = dynamic(() => import("@/components/ZiweiStacks"));
const VedicChart = dynamic(() => import("@/components/VedicChart"));
import Icon from "@/components/Icon";
import GlideSelect from "@/components/GlideSelect";
import { readingToPlainText } from "@/lib/readingMarkdown";
import ReadingText from "@/components/ReadingText";
import SplitText from "@/components/SplitText";
import AnimatedContent from "@/components/AnimatedContent";
import SwipeToast from "@/components/SwipeToast";
import HeirloomPrint from "@/components/HeirloomPrint";
import BirthProfilePicker from "@/components/BirthProfilePicker";
import { profileToChartFields } from "@/lib/birth-profiles";
import PageHeader from "@/components/PageHeader";
import FieldGroup from "@/components/FieldGroup";
import { FOCUS_AREAS, PRESETS, chartSummaryText, type ChartResult as ChartResultT, type ChartSystem } from "@/lib/chart-submit";
import type { ZiweiResult } from "@/lib/charts";
import type { ChartForm, ChartPrefs, ChartSession } from "./useChartsClient";

/*
 * F10 (2026-11-09): one presentational component per visual section
 * of the charts page, moved verbatim out of ChartsClient.tsx. All
 * state lives in useChartsClient.ts; these only render it.
 */

const inputClass =
  "w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-medium text-cream";

const SYSTEM_ORDER: ChartSystem[] = ["western", "ziwei", "vedic"];
// Phase F: one plain line per system under the picker, mirroring the
// reports page blurbs, so a newcomer picks by meaning, not by name.
const SYSTEM_BLURBS: Record<ChartSystem, string> = {
  western: "Tropical zodiac, the familiar Sun-sign system, with Placidus houses.",
  vedic: "Sidereal zodiac, Moon-centered, with whole-sign houses and dasha periods.",
  ziwei: "Chinese Purple Star astrology: palaces, stars, and life periods.",
};

/** Page header and the collapsed "How your inputs are used" notes. */
export function ChartsIntro() {
  return (
  <div className="text-center">
    <PageHeader eyebrow="Birth Charts" title="Cast a birth chart" titleClassName="sm:text-6xl" />
    <p className="mx-auto mt-4 max-w-xl text-cream/75">
      Ziwei, Western, and Vedic charts. Calculation is free.
      Interpretation is 1 Oracle, first per system free.
    </p>
    <p className="mx-auto mt-2 max-w-xl text-sm text-cream/80">
      Birth data is used for this calculation and, after a
      successful calculation, remembered on this device so you do
      not re-enter it next time. AI gets only chart positions,
      never birth data.
    </p>
    {/* Audit 6: this long block used to sit above the form, so a
        first-time user had to scroll to the system tabs and the
        Use example button. It is now collapsed by default; the
        full text, including the timezone and privacy notes, is
        still one tap away, and the per-system timezone disclosure
        is below the form. */}
    <details className="mx-auto mt-4 max-w-xl rounded-2xl border border-gold/20 bg-panel/50 p-4 text-left text-sm leading-relaxed text-cream/75">
      <summary className="cursor-pointer font-semibold text-goldbright">How your inputs are used</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Gender: Ziwei only. Western and Vedic do not use it.</li>
        <li>Birthplace: sets the rising sign and houses for Western and Vedic, and the local time for Ziwei.</li>
        <li>Birth time: clock time at the birthplace. The chart names the timezone it used, so you can correct it if it is wrong. If no timezone can be found for the place, the chart falls back to a rough estimate from longitude and says so. Unknown time uses noon for planets and withholds Rising, Midheaven, and houses. Ziwei needs a birth hour.</li>
        <li>Near a boundary: for times near a sign or palace boundary, a fallback estimate can fall on either side, so treat borderline placements as approximate. The full time rules are on the Methodology page.</li>
      </ul>
    </details>
  </div>
  );
}

/** System picker (buttons under reduced motion, GlideSelect otherwise) and the one-line blurb. */
export function SystemPicker({ prefs, s }: { prefs: ChartPrefs; s: ChartSession }) {
  const { reducedMotion, siteTheme } = prefs;
  const { system, selectSystem } = s;
  return (
    <>
    {reducedMotion ? (
      <>
        <p className="mx-auto mt-8 max-w-lg text-center text-sm text-cream/75">Choose a system</p>
        <div className="mx-auto mt-2 flex max-w-lg flex-wrap gap-3">
        {SYSTEM_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => selectSystem(s)}
            className={`flex-1 rounded-full px-4 py-3 text-sm font-bold ${
              system === s ? "btn-gold" : "border border-gold/40 text-goldbright"
            }`}
            aria-pressed={system === s}
          >
            {s === "ziwei" ? "Ziwei" : s === "vedic" ? "Vedic" : "Western"}
          </button>
        ))}
        </div>
      </>
    ) : (
      <div className="mx-auto mt-8 max-w-lg">
        <p className="text-center text-sm text-cream/75">Choose a system</p>
        <div className="mt-2">
          <GlideSelect
            options={[
              { value: "western", label: "Western" },
              { value: "ziwei", label: "Ziwei" },
              { value: "vedic", label: "Vedic" },
            ]}
            value={system}
            onChange={(v) => selectSystem(v as ChartSystem)}
            ariaLabel="Chart system"
            size="lg"
            radius={12}
            accentColor={siteTheme === "light" ? "#8a6d0a" : "#d4af37"}
            surfaceColor={siteTheme === "light" ? "#ffffff" : "#1a1f2e"}
            highlightColor={siteTheme === "light" ? "#f3ead3" : "#3a3120"}
            textColor={siteTheme === "light" ? "#1c1a15" : "#ede6d6"}
            className="w-full [&>button]:w-full [&>button]:justify-between"
          />
        </div>
      </div>
    )}

    <p className="mx-auto mt-3 max-w-lg text-center text-sm text-cream/75">{SYSTEM_BLURBS[system]}</p>
    </>
  );
}

/** AF-060: Clear remembered birth details and the saved-profile picker. */
export function BirthDetailsBar({ form, onClear }: { form: ChartForm; onClear: () => void }) {
  const { date, setDate, time, setTime, unknownTime, setUnknownTime, timeZoneOverride, setTimeZoneOverride, gender, setGender, preset, setPreset, latitude, setLatitude, longitude, setLongitude } = form;
  return (
    <>
    <div className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-mist">
        Your birth details are remembered on this device after a successful calculation.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="rounded-xl border border-gold/30 px-4 py-3 text-xs font-semibold text-cream/90 hover:bg-gold/10"
      >
        Clear remembered birth details
      </button>
    </div>
    <div className="mx-auto mt-6 max-w-xl">
      <BirthProfilePicker
        label="charts"
        current={{
          name: "",
          date,
          time,
          unknownTime,
          gender,
          preset,
          latitude,
          longitude,
          timeZone: timeZoneOverride,
        }}
        onSelect={(p) => {
          const f = profileToChartFields(p);
          setDate(f.date);
          setTime(f.time);
          setUnknownTime(f.unknownTime);
          setGender(f.gender);
          setPreset(f.preset);
          setLatitude(f.latitude);
          setLongitude(f.longitude);
          setTimeZoneOverride(f.timeZone);
        }}
      />
    </div>
    </>
  );
}

/** The shared birth-data form (all three systems). */
export function BirthForm({ prefs, form, s }: { prefs: ChartPrefs; form: ChartForm; s: ChartSession }) {
  const { reducedMotion, siteTheme } = prefs;
  const { date, setDate, time, setTime, unknownTime, setUnknownTime, timeZoneOverride, setTimeZoneOverride, gender, setGender, preset, setPreset, latitude, setLatitude, longitude, setLongitude, placeSearch, setPlaceSearch, placeStatus, placeBusy, useExample, lookupPlace } = form;
  const { system, formRef, loading, error, onSubmit } = s;
  return (
  <form ref={formRef} onSubmit={onSubmit} className="mx-auto mt-8 max-w-xl rounded-3xl border border-gold/25 bg-panel/70 p-6">
    {/* Audit 6: Use example lives at the top of the form, not only
        at its bottom, so it is visible without scrolling once the
        system tabs are on screen, on desktop and at 390px. */}
    <div className="mb-5">
      <button type="button" onClick={useExample} className="rounded-full border border-gold/40 px-6 py-3 text-sm font-bold text-goldbright">
        Use example: 1990-01-01, 08:00, Manila
      </button>
    </div>
    {/* AF-060: the English/中文 toggle lives with the Ziwei chart
        result below, not mid-form. The form itself stays English. */}
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
        <label className="flex items-center gap-2 text-sm text-cream/80">
          <input type="checkbox" checked={unknownTime} onChange={(e) => setUnknownTime(e.target.checked)} />
          I do not know the birth time
        </label>
        {/* Phase 4B (4.2): the hour/minute dials are gone. A plain
            time input is keyboard-typable, works with reduced
            motion, and cannot drift off by a stray drag. The
            date stays on the themed picker beside it. */}
        <input
          id="chart-time"
          type="time"
          disabled={unknownTime}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={`${inputClass} mt-2`}
        />
        <p className="mt-1 text-xs text-cream/80">Type the time as HH:MM, or tap the field to pick it. Clock time at the birthplace.</p>
      </div>
      {/* AF-060: field order is system, date, time, place search.
          The place search comes before the city list, not after it. */}
      <div className="sm:col-span-2">
        <label htmlFor="chart-place-search" className={labelClass}>
          Birthplace — search a place name (free, no key)
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
          <button type="button" onClick={lookupPlace} disabled={placeBusy} className="shrink-0 rounded-xl border border-gold/40 px-4 py-3 text-sm font-bold text-goldbright disabled:opacity-100 disabled:saturate-50">
            {placeBusy ? "Searching…" : "Find"}
          </button>
        </div>
        {placeStatus && <p className="mt-2 text-sm text-cream/75">{placeStatus}</p>}
        <p className="mt-1 text-xs text-cream/80">
          The place name is used only for this lookup. Only its coordinates are kept for the calculation, and the
          place name is never stored and never sent to AI. Calculate chart also resolves a typed place first.
        </p>
      </div>
      <div>
        <span className={labelClass}>Birthplace</span>
        {reducedMotion ? (
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
            <option value="">Choose a birthplace…</option>
            {PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
            <option value="Custom">Custom coordinates</option>
          </select>
        ) : (
          <GlideSelect
            options={[
              { value: "", label: "Choose a birthplace…" },
              ...PRESETS.map((p) => ({ value: p.label, label: p.label })),
              { value: "Custom", label: "Custom coordinates" },
            ]}
            value={preset}
            onChange={(v) => {
              const found = PRESETS.find((p) => p.label === v);
              setPreset(v);
              if (found) {
                setLatitude(String(found.latitude));
                setLongitude(String(found.longitude));
              }
            }}
            ariaLabel="Birthplace"
            size="lg"
            radius={12}
            accentColor={siteTheme === "light" ? "#8a6d0a" : "#d4af37"}
            surfaceColor={siteTheme === "light" ? "#ffffff" : "#1a1f2e"}
            highlightColor={siteTheme === "light" ? "#f3ead3" : "#3a3120"}
            textColor={siteTheme === "light" ? "#1c1a15" : "#ede6d6"}
            className="w-full [&>button]:w-full [&>button]:justify-between"
          />
        )}
      </div>
      {/* AF-066: same gender options as /reports — Female, Male,
          and Prefer not to say. Ziwei needs a choice at submit;
          the other systems ignore it. */}
      {system === "ziwei" && (
        <div>
          <span className={labelClass}>Gender</span>
          <FieldGroup className="mt-1 flex flex-wrap gap-3" aria-label="Gender">
            {(["female", "male", ""] as const).map((g) => (
              <button
                key={g || "unset"}
                type="button"
                onClick={() => setGender(g)}
                className={`rounded-full px-4 py-3 text-sm font-bold ${gender === g ? "btn-gold" : "border border-gold/40 text-goldbright"}`}
                aria-pressed={gender === g}
              >
                {g === "female" ? "Female" : g === "male" ? "Male" : "Prefer not to say"}
              </button>
            ))}
          </FieldGroup>
          <p className="mt-1 text-xs text-cream/80">Ziwei places stars by gender, so a choice is needed for a Ziwei chart.</p>
        </div>
      )}
      {/* AF-060: latitude, longitude, and timezone live under
          Advanced. Most seekers only ever use the place search. */}
      <details className="rounded-2xl border border-gold/20 bg-panel/50 p-4 sm:col-span-2">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">Advanced: coordinates and timezone</summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor="chart-lat" className={labelClass}>
          Latitude
        </label>
        <input id="chart-lat" type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="chart-lon" className={labelClass}>
          Longitude
        </label>
        <input id="chart-lon" type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="chart-timezone" className={labelClass}>
          Timezone (optional, only if the chart names the wrong one)
        </label>
        <input
          id="chart-timezone"
          type="text"
          value={timeZoneOverride}
          onChange={(e) => setTimeZoneOverride(e.target.value)}
          placeholder="Auto-detect from birthplace, e.g. America/New_York"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-cream/80">
          Left blank, the timezone is looked up from the birthplace coordinates, with daylight saving for the
          birth date, and the chart below names the zone it used. If that zone is wrong, type the IANA name
          here (for example America/New_York) and recalculate.
        </p>
      </div>
        </div>
      </details>
    </div>
    {error && (
      <p role="alert" className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm alert-error-text">
        {error}
      </p>
    )}

    {/* M1.2: Ziwei cannot be calculated without a birth hour, so
        the button stays disabled with the reason inline instead
        of failing after the click. */}
    {system === "ziwei" && unknownTime && (
      <p className="mt-4 rounded-xl border border-gold/25 bg-panel/50 px-4 py-3 text-sm leading-relaxed text-cream/80">
        Ziwei needs a birth hour: the twelve palaces are placed by
        the two-hour branch you were born in. Uncheck &ldquo;I do not
        know the birth time&rdquo; and set the hour to calculate a Ziwei
        chart, or pick Western or Vedic for an unknown-time chart.
      </p>
    )}
    <div className="mt-6 flex flex-wrap gap-3">
      <button type="submit" disabled={loading || (system === "ziwei" && unknownTime)} className="btn-gold rounded-full px-6 py-3 text-sm font-bold disabled:opacity-100 disabled:saturate-50">
        {loading ? "Calculating…" : (<span className="inline-flex items-center gap-2"><Icon name="chart" size={18} />Calculate chart</span>)}
      </button>
    </div>
  </form>
  );
}

/** Skip link, burst, offscreen share card, title, one-line summary, timezone line. */
export function ResultHeader({ prefs, s, result }: { prefs: ChartPrefs; s: ChartSession; result: ChartResultT }) {
  const { ziweiLang } = prefs;
  const { shareRef, showBurst } = s;
  return (
    <>
    {/* Personal Phase 1: the chart visual comes first, but the
        plain-words interpretation must not be hidden below it.
        This jump link is the guided next step for anyone who
        does not want to read degrees themselves. */}
    <p className="mb-4 text-center text-sm text-cream/80">
      You do not need to read the degrees yourself.{" "}
      <a href="#chart-interpretation" className="font-semibold text-goldbright underline">
        Skip to the plain-words interpretation
      </a>
    </p>
    {showBurst && <CardBurst count={24} distance={110} />}
    {/* Share card, result level: Audit 3 found the legend
        promising "share it as an image" with no Share button
        before interpretation, because the old share button only
        rendered after an interpretation existed. This offscreen
        card and the button below exist for every result, before
        interpretation, reusing chartSummaryText. */}
    <div aria-hidden="true" style={{ position: "fixed", left: "-10000px", top: 0, width: 1200, height: 630 }}>
      <div ref={shareRef} style={{ width: 1200, height: 630, background: "#0a0e1a", color: "#ede6d6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, fontFamily: "Cormorant Garamond, Georgia, serif", border: "2px solid #d4af37" }}>
        <div style={{ fontSize: 28, letterSpacing: 8, color: "#d4af37" }}>SORTES</div>
        <div style={{ fontSize: 48, marginTop: 12 }}>{result.system === "ziwei" ? "Ziwei chart" : result.system === "vedic" ? "Vedic chart" : "Western chart"}</div>
        <div style={{ fontSize: 24, marginTop: 24, maxWidth: 900, textAlign: "center" }}>{chartSummaryText(result, ziweiLang)}</div>
        <div style={{ fontSize: 18, marginTop: 24, color: "#9ca3af" }}>A reflection, not a prediction. sortes.resonantatlas.com</div>
      </div>
    </div>
    {/* The key remounts the reveal for each new result, so a
        recalculation with another system replays it. The
        offscreen share card above keeps its plain text. */}
    <SplitText
      key={result.system}
      tag="h2"
      text={result.system === "ziwei" ? "Ziwei chart" : result.system === "vedic" ? "Vedic chart" : "Western chart"}
      className="font-display text-3xl text-goldbright"
    />
    <p className="mt-3 rounded-2xl border border-gold/25 bg-panel/70 px-4 py-3 text-sm leading-relaxed text-cream/90">
      <strong className="text-goldbright">Your chart in one line: </strong>
      {chartSummaryText(result, ziweiLang)}
    </p>
    {/* Phase 4B (4.3): the time assumption is shown, not hidden.
        IANA path: the zone and its historical offset (DST
        included) for the birth date. Fallback: no zone could be
        resolved, so the time was converted by longitude only,
        and the timezone field above is how to correct it. */}
    {result.timeZone ? (
      <p className="mt-3 text-sm text-cream/75">
        Timezone used: {result.timeZone} ({formatUtcOffset(result.utcOffsetMinutes ?? 0)}), with daylight saving for the birth date.
        {result.system === "ziwei" ? " Solar time is then set by longitude." : ""}
      </p>
    ) : (
      <p className="mt-3 text-sm text-cream/75">
        No timezone could be resolved for these coordinates, so the birth time was converted by longitude only
        ({formatUtcOffset(result.utcOffsetMinutes ?? 0)}). If this is wrong, enter the IANA timezone in the
        form above and recalculate.
      </p>
    )}
    </>
  );
}

/** Ziwei only: language, glosses, share, ring/square view, solar-time note. */
export function ZiweiControls({ prefs, s, result }: { prefs: ChartPrefs; s: ChartSession; result: ZiweiResult }) {
  const { ziweiView, setZiweiView, ziweiLang, showGlosses, setShowGlosses, setZiweiLangSaved } = prefs;
  const { shareBusy, onShareChart } = s;
  return (
    <>
    <>

      <FieldGroup className="mt-4 flex flex-wrap gap-3" aria-label="Chart language">
        {(["en", "zh"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setZiweiLangSaved(l)}
            className={`rounded-full px-4 py-3 text-sm font-bold ${
              ziweiLang === l ? "btn-gold" : "border border-gold/40 text-goldbright"
            }`}
            aria-pressed={ziweiLang === l}
          >
            {l === "en" ? "English" : "中文"}
          </button>
        ))}
      </FieldGroup>
      <label className="mt-3 flex items-center gap-2 text-sm text-cream/80">
        <input type="checkbox" checked={showGlosses} onChange={(e) => setShowGlosses(e.target.checked)} />
        Show Chinese glosses (default off in English, on in Chinese)
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-3 text-sm font-bold text-goldbright disabled:opacity-100 disabled:saturate-50">
          {shareBusy ? "Creating image…" : (<span className="inline-flex items-center gap-2"><Icon name="share" size={16} />Share chart as image</span>)}
        </button>
      </div>
      <FieldGroup className="mt-3 flex flex-wrap gap-3" aria-label="Ziwei chart view">
        {(["ring", "square"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setZiweiView(v)}
            className={`rounded-full px-4 py-3 text-sm font-bold ${
              ziweiView === v ? "btn-gold" : "border border-gold/40 text-goldbright"
            }`}
            aria-pressed={ziweiView === v}
          >
            {v === "ring" ? "Circle chart" : "Traditional square"}
          </button>
        ))}
      </FieldGroup>
      {result.solarCorrectionMinutes !== 0 && (
        <p className="mt-3 text-sm text-cream/75">
          {result.timeBasis === "iana"
            ? `Timezone ${result.timeZone ?? ""} (${formatUtcOffset(result.utcOffsetMinutes ?? 0)}) applied, then longitude correction to solar time: ${result.solarCorrectionMinutes > 0 ? "+" : ""}${result.solarCorrectionMinutes} minutes, corrected time ${result.solarCorrectedTime}. Equation of time is not applied.`
            : `Longitude correction applied: ${result.solarCorrectionMinutes > 0 ? "+" : ""}${result.solarCorrectionMinutes} minutes, corrected time ${result.solarCorrectedTime}. No timezone could be resolved, so DST and historical timezones are not applied; equation of time is not applied either.`}
        </p>
      )}
    </>
    </>
  );
}

/** Western and Vedic: the share button (Ziwei has it in ZiweiControls). */
export function ShareChartButton({ s }: { s: ChartSession }) {
  const { shareBusy, onShareChart } = s;
  return (
  <div className="mt-3 flex flex-wrap gap-3">
    <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-3 text-sm font-bold text-goldbright disabled:opacity-100 disabled:saturate-50">
      {shareBusy ? "Creating image…" : (<span className="inline-flex items-center gap-2"><Icon name="share" size={16} />Share chart as image</span>)}
    </button>
  </div>
  );
}

/** The chart renderer for the cast system: Ziwei board, Vedic chart, or Western wheel. */
export function ChartPanel({ prefs, result }: { prefs: ChartPrefs; result: ChartResultT }) {
  const { ziweiView, ziweiLang, showGlosses } = prefs;
  return (
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
  );
}

/** Chart glossary, 2026-11-05: Western and Vedic terms, collapsed by default. */
export function ChartGlossary({ result }: { result: ChartResultT }) {
  return (
  <details className="mt-4 rounded-2xl border border-gold/20 bg-panel/50 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-goldbright">
      Terms in this chart
    </summary>
    <dl className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
      {result.system === "western" ? (
        <>
          <div><dt className="font-semibold text-goldbright">Ascendant</dt><dd>Your rising sign: the sign on the eastern horizon at your birth moment. It shapes first impressions and how you meet the world.</dd></div>
          <div><dt className="font-semibold text-goldbright">Midheaven</dt><dd>The highest point of the chart. It points to career, reputation, and public direction.</dd></div>
          <div><dt className="font-semibold text-goldbright">Houses</dt><dd>Twelve life areas, from self and money to home, work, and relationships. A planet in a house colours that area.</dd></div>
          <div><dt className="font-semibold text-goldbright">Aspects</dt><dd>Angles between planets, such as conjunctions and squares. Easy angles flow; hard angles create tension that asks for work.</dd></div>
          <div><dt className="font-semibold text-goldbright">Retrograde</dt><dd>A planet that appears to move backwards from Earth. Read it as a time to review, revisit, and redo, not as bad luck.</dd></div>
        </>
      ) : (
        <>
          <div><dt className="font-semibold text-goldbright">Lagna</dt><dd>The ascendant in Vedic astrology: the sign rising at your birth. It sets the first house and the whole chart.</dd></div>
          <div><dt className="font-semibold text-goldbright">Rashi</dt><dd>A zodiac sign. Vedic charts use the sidereal zodiac, so signs sit about 24 degrees behind the Western tropical ones.</dd></div>
          <div><dt className="font-semibold text-goldbright">Nakshatra</dt><dd>A lunar mansion: one of 27 star divisions the Moon passes through. It adds a finer layer of meaning to a planet.</dd></div>
          <div><dt className="font-semibold text-goldbright">Dasha</dt><dd>A planetary period. Each major period is ruled by one planet and colours the years it runs.</dd></div>
          <div><dt className="font-semibold text-goldbright">Bhava</dt><dd>A house. The twelve bhavas cover the same life areas as Western houses, counted from the Lagna.</dd></div>
        </>
      )}
    </dl>
  </details>
  );
}

/** M3.1-M3.3: per-system transit / activation panel, from in-memory data only. */
export function ChartTransits({ form, result }: { form: ChartForm; result: ChartResultT }) {
  const { date, time, unknownTime, timeZoneOverride, gender, latitude, longitude } = form;
  return (
    <>
    {/* M3.1: transit-to-natal horoscope, Western charts only.
        The natal planets come from the chart just calculated
        in-memory; nothing new is stored for this. */}
    {result.system === "western" && (
      <WesternTransits planets={result.planets} unknownTime={result.unknownTime} />
    )}
    {/* M3.2: Gochara plus panchanga, Vedic charts only. The
        natal Moon longitude comes from the chart just
        calculated in-memory; nothing new is stored for this. */}
    {result.system === "vedic" && (
      <VedicTransits
        moonLongitude={result.planets.find((p) => p.name === "moon")?.longitude ?? 0}
        planets={result.planets}
        unknownTime={result.unknownTime}
      />
    )}
    {/* M3.3: palace activation stacks, Ziwei charts only. The
        birth inputs come from the form that calculated this
        chart; Ziwei results always carry a known birth hour,
        since unknown hours are refused. Nothing new is stored. */}
    {result.system === "ziwei" && !unknownTime && gender !== "" && (
      <ZiweiStacks
        date={date}
        hour={Number(time.split(":")[0])}
        minute={Number(time.split(":")[1] ?? 0)}
        gender={gender}
        longitude={Number(longitude)}
        latitude={Number(latitude)}
        timeZone={timeZoneOverride.trim() || undefined}
      />
    )}
    </>
  );
}

/** "How to read this chart" legend, Chinese in Ziwei zh mode. */
export function ChartLegend({ prefs, result }: { prefs: ChartPrefs; result: ChartResultT }) {
  const { ziweiLang } = prefs;
  return (
  <section className="mt-10 scroll-mt-24 rounded-3xl border border-gold/20 bg-panel/50 p-6" aria-label="Chart legend">
    <h3 className="font-display text-2xl text-goldbright">{result.system === "ziwei" && ziweiLang === "zh" ? "如何读这张星盘" : "How to read this chart"}</h3>
    <p className="mt-2 text-sm text-cream/75">
      {result.system === "ziwei" && ziweiLang === "zh"
        ? ZIWEI_LEGEND_ZH.intro
        : "Start here if a word is new, then read your interpretation below."}
    </p>
    {/* Personal Phase 2: the legend list is secondary detail.
        It stays available behind one tap, instead of filling
        the result before the interpretation. Native details
        keeps it keyboard accessible with no new component. */}
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-semibold text-goldbright">
        {/* Codex review on PR 46, correct: in Chinese Ziwei
            mode the heading and intro switch to Chinese, so
            this control must too, or Chinese-only users would
            not know how to reveal the legend. */}
        {result.system === "ziwei" && ziweiLang === "zh"
          ? "显示完整图例"
          : "Show the full legend"}
      </summary>
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
    </details>
    <p className="mt-4 text-sm text-cream/75">
      {result.system === "ziwei" && ziweiLang === "zh" ? (
        <><strong className="text-goldbright">下一步：</strong>{ZIWEI_LEGEND_ZH.nextStep}</>
      ) : (
        <><strong className="text-goldbright">Next step: </strong>
        read your interpretation, save it, or share it.</>
      )}
    </p>
  </section>
  );
}

/** Focus, question, interpret, save, share, heirloom export. */
export function InterpretationPanel({ prefs, s, result }: { prefs: ChartPrefs; s: ChartSession; result: ChartResultT }) {
  const { ziweiLang } = prefs;
  const { focus, setFocus, question, setQuestion, interpretation, interpFallback, interpModel, interpLoading, interpError, interpFailed, interpToastOpen, setInterpToastOpen, interpFree, interpSignInNeeded, user, saved, shareBusy, displayFree, onInterpret, onSaveChart, onShareChart } = s;
  return (
  <section id="chart-interpretation" className="mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/70 p-6" aria-label="Chart interpretation">
    <h3 className="font-display text-2xl text-goldbright">{result.system === "ziwei" && ziweiLang === "zh" ? "解读" : "Interpretation"}</h3>
    <p className="mt-2 text-sm leading-relaxed text-cream/75">
      In plain words, for your focus and question.
    </p>
    {result.system === "ziwei" && ziweiLang === "zh" && (
      <p className="mt-2 text-sm text-cream/80">解读由 AI 用英文生成，基于上方星盘位置；图表标签已为中文。</p>
    )}
    <p className="mt-2 text-sm text-cream/75">
      Calculation was free and unsaved. Interpretation is{" "}
      <strong className="text-cream">
        {displayFree ? "free for your first chart in this system, then 1 Oracle" : "1 Oracle"}
      </strong>
      . The AI receives only chart positions, signs, and stars, plus your focus and question, never your birth date, time, or place.
    </p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <span className={labelClass}>Focus area</span>
        <FieldGroup className="mt-1 flex flex-wrap gap-2" aria-label="Focus area">
          {FOCUS_AREAS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFocus(f)}
              className={`rounded-full px-3 py-2.5 min-h-[44px] text-sm font-bold ${focus === f ? "btn-gold" : "border border-gold/40 text-goldbright"}`}
              aria-pressed={focus === f}
            >
              {f}
            </button>
          ))}
        </FieldGroup>
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
    {interpFailed && (
      <div className="mt-4 space-y-3">
        <SwipeToast
          open={interpToastOpen}
          onClose={() => setInterpToastOpen(false)}
          title="Interpretation failed"
          actionLabel="Retry"
          onAction={onInterpret}
          inline
          closeButton
          width={320}
          background="#1a1f2e"
          color="#ede6d6"
          fuseColor="#d4af37"
        />
        <button
          type="button"
          onClick={onInterpret}
          disabled={interpLoading}
          className="w-full rounded-xl border border-gold/40 px-4 py-3 text-sm font-semibold text-goldbright hover:bg-gold/15 disabled:opacity-100 disabled:saturate-50"
        >
          Try again
        </button>
      </div>
    )}
    {!user || interpSignInNeeded ? (
      <p className="mt-5 text-sm text-cream">
        Interpretations need an account so they are saved to it.{" "}
        <Link href="/account" className="font-semibold text-goldbright underline">
          Sign in to get your interpretation
        </Link>
      </p>
    ) : (
      <button type="button" onClick={onInterpret} disabled={interpLoading} className="btn-gold mt-5 rounded-full px-6 py-3 text-sm font-bold disabled:opacity-100 disabled:saturate-50">
        {interpLoading ? "Interpreting…" : displayFree ? "Get interpretation (free)" : "Get interpretation (1 Oracle)"}
      </button>
    )}
    {interpretation && (
      <div className="mt-6">
        <p className="text-xs uppercase tracking-widest text-gold">
          {interpFallback
            ? "Standard interpretation · prepared from your chart positions, not AI-generated"
            : `${interpFree ? "Free interpretation" : "1 Oracle interpretation"} · Personalized · AI-generated${interpModel ? ` · Written with ${interpModel}` : ""}`}
        </p>
        <ReadingText text={interpretation} className="mt-3 leading-relaxed text-cream/90" />
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={onSaveChart} disabled={saved} className="rounded-full border border-gold/40 px-5 py-3 text-sm font-bold text-goldbright disabled:opacity-100 disabled:saturate-50">
            {saved ? "Saved to journal" : "Save to journal"}
          </button>
          <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-3 text-sm font-bold text-goldbright disabled:opacity-100 disabled:saturate-50">
            {shareBusy ? "Creating image…" : (<span className="inline-flex items-center gap-2"><Icon name="share" size={16} />Share chart as image</span>)}
          </button>
        </div>
        {saved && <p className="mt-3 text-sm text-cream/75">Saved as positions only, never birth data. See your journal.</p>}
        {/* Phase 5 (5.4a): heirloom keepsake export
            (print-to-PDF) of this chart's real summary and
            interpretation. */}
        <div className="mt-5">
          <HeirloomPrint
            title={result.system === "ziwei" ? "Ziwei chart" : result.system === "vedic" ? "Vedic chart" : "Western chart"}
            subtitle={question.trim() ? `Focus: ${focus} · “${question.trim()}”` : `Focus: ${focus}`}
            date={new Date().toISOString()}
            sections={[
              { heading: "Your chart in one line", body: chartSummaryText(result, ziweiLang) },
              { heading: "Interpretation", body: readingToPlainText(interpretation) },
            ]}
          />
        </div>
      </div>
    )}
  </section>
  );
}

/** The cast chart: everything below the form once a result exists. */
export function ChartResult({ s, prefs, form, result }: { s: ChartSession; prefs: ChartPrefs; form: ChartForm; result: ChartResultT }) {
  const { resultRef } = s;
  return (
  <AnimatedContent trigger="mount" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2} stagger={0}>
  <section ref={resultRef} className="num magic-glow relative mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/40 p-4 sm:p-6" aria-live="polite">
    <ResultHeader prefs={prefs} s={s} result={result} />
    {result.system === "ziwei" && (
      <ZiweiControls prefs={prefs} s={s} result={result} />
    )}
    {result.system !== "ziwei" && (
      <ShareChartButton s={s} />
    )}
    <ChartPanel prefs={prefs} result={result} />

    {/* Chart glossary, 2026-11-05: Western and Vedic charts
        show positions, aspects, and houses with no beginner
        glossary, while Ziwei already has its own legend below.
        Plain definitions, collapsed by default, no new data. */}
    {result.system !== "ziwei" && (
      <ChartGlossary result={result} />
    )}

    <ChartTransits form={form} result={result} />

    <ChartLegend prefs={prefs} result={result} />

    <InterpretationPanel prefs={prefs} s={s} result={result} />
  </section>
  </AnimatedContent>
  );
}

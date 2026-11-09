"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import RubberSegment from "@/components/RubberSegment";
import SpecularButton from "@/components/SpecularButton";
import StatusMark from "@/components/StatusMark";
import SwipeToast from "@/components/SwipeToast";
import CallChip from "@/components/CallChip";
import AnimatedContent from "@/components/AnimatedContent";
import Counter from "@/components/Counter";
import { getReports, saveReport, spendCredit } from "@/lib/storage";
import { SAMPLE_TRANSIT_REPORT } from "@/lib/sample-report";
import BirthProfilePicker from "@/components/BirthProfilePicker";
import { profileToReportFields } from "@/lib/birth-profiles";
import type { SavedReport, ReportType } from "@/lib/reports";

const inputClass =
  "w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none";
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

interface BirthFormState {
  date: string;
  unknownTime: boolean;
  hour: string;
  minute: string;
  preset: string;
  latitude: string;
  longitude: string;
  gender: "" | "male" | "female";
}

function emptyBirth(): BirthFormState {
  // AF-066: same empty start as /charts. No 08:00 hour, no Manila
  // city: a prefilled hour and city read as the seeker's own data
  // while the birth date sits empty.
  return {
    date: "",
    unknownTime: false,
    hour: "",
    minute: "",
    preset: "",
    latitude: "",
    longitude: "",
    gender: "",
  };
}

function birthPayload(b: BirthFormState) {
  return {
    date: b.date,
    hour: b.unknownTime ? null : Number(b.hour),
    minute: Number(b.minute),
    latitude: Number(b.latitude),
    longitude: Number(b.longitude),
    gender: b.gender === "" ? null : b.gender,
  };
}

function BirthForm({
  title,
  value,
  onChange,
  genderRequired,
}: {
  title: string;
  value: BirthFormState;
  onChange: (next: BirthFormState) => void;
  genderRequired: boolean;
}) {
  const set = (patch: Partial<BirthFormState>) => onChange({ ...value, ...patch });
  // F17: place search through the same geocoder /charts uses, so any
  // city works. Presets stay as shortcuts; coordinates stay editable.
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeStatus, setPlaceStatus] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);
  async function findPlace() {
    const q = placeQuery.trim();
    if (!q) {
      setPlaceStatus("Type a place name first, for example a city.");
      return;
    }
    setPlaceBusy(true);
    setPlaceStatus("Looking up coordinates…");
    try {
      const res = await fetch(`/api/chart/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Place lookup failed.");
      set({ preset: "", latitude: String(data.latitude), longitude: String(data.longitude) });
      setPlaceStatus(`Found coordinates: ${data.latitude}, ${data.longitude}.`);
    } catch (err) {
      setPlaceStatus(err instanceof Error ? err.message : "Place lookup failed.");
    } finally {
      setPlaceBusy(false);
    }
  }
  const prefix = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="rounded-3xl border border-gold/25 bg-panel/70 p-6">
      <p className="font-display text-2xl text-goldbright">{title}</p>
      <div className="mt-4">
        <BirthProfilePicker
          label={prefix}
          current={{
            name: "",
            date: value.date,
            time: value.unknownTime
              ? ""
              : `${value.hour.padStart(2, "0")}:${value.minute.padStart(2, "0")}`,
            unknownTime: value.unknownTime,
            gender: value.gender,
            preset: value.preset,
            latitude: value.latitude,
            longitude: value.longitude,
          }}
          onSelect={(p) => onChange({ ...value, ...profileToReportFields(p) })}
        />
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor={`${prefix}-date`} className={labelClass}>
            Birth date
          </label>
          <input
            id={`${prefix}-date`}
            type="date"
            required
            className={inputClass}
            value={value.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            checked={value.unknownTime}
            onChange={(e) => set({ unknownTime: e.target.checked })}
          />
          Birth time unknown
        </label>
        {!value.unknownTime && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${prefix}-hour`} className={labelClass}>
                Hour (0-23)
              </label>
              <input
                id={`${prefix}-hour`}
                type="number"
                min={0}
                max={23}
                required
                className={inputClass}
                value={value.hour}
                onChange={(e) => set({ hour: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={`${prefix}-minute`} className={labelClass}>
                Minute
              </label>
              <input
                id={`${prefix}-minute`}
                type="number"
                min={0}
                max={59}
                className={inputClass}
                value={value.minute}
                onChange={(e) => set({ minute: e.target.value })}
              />
            </div>
          </div>
        )}
        <div>
          <label htmlFor={`${prefix}-place`} className={labelClass}>
            Search any birthplace
          </label>
          <div className="flex gap-2">
            <input
              id={`${prefix}-place`}
              type="text"
              className={inputClass}
              placeholder="City, country"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void findPlace();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void findPlace()}
              disabled={placeBusy}
              className="shrink-0 rounded-xl border border-gold/40 px-4 py-3 text-sm font-semibold text-goldbright hover:bg-gold/15 disabled:opacity-60"
            >
              {placeBusy ? "Finding…" : "Find"}
            </button>
          </div>
          {placeStatus && (
            <p role="status" className="mt-1.5 text-xs text-mist">
              {placeStatus}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${prefix}-preset`} className={labelClass}>
            Or pick a common city
          </label>
          <select
            id={`${prefix}-preset`}
            className={inputClass}
            value={value.preset}
            onChange={(e) => {
              const found = PRESETS.find((p) => p.label === e.target.value);
              set({
                preset: e.target.value,
                latitude: found ? String(found.latitude) : value.latitude,
                longitude: found ? String(found.longitude) : value.longitude,
              });
            }}
          >
            <option value="">Choose a birth city…</option>
            {PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${prefix}-lat`} className={labelClass}>
              Latitude
            </label>
            <input
              id={`${prefix}-lat`}
              type="number"
              step="any"
              required
              className={inputClass}
              value={value.latitude}
              onChange={(e) => set({ latitude: e.target.value, preset: "" })}
            />
          </div>
          <div>
            <label htmlFor={`${prefix}-lon`} className={labelClass}>
              Longitude
            </label>
            <input
              id={`${prefix}-lon`}
              type="number"
              step="any"
              required
              className={inputClass}
              value={value.longitude}
              onChange={(e) => set({ longitude: e.target.value, preset: "" })}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${prefix}-gender`} className={labelClass}>
            Gender{genderRequired ? " (required for a year-ahead reading)" : ""}
          </label>
          <select
            id={`${prefix}-gender`}
            className={inputClass}
            value={value.gender}
            onChange={(e) => set({ gender: e.target.value as BirthFormState["gender"] })}
          >
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>
    </div>
  );
}

const TYPE_BLURBS: Record<ReportType, string> = {
  transit:
    "One chosen date, read against your natal chart: Western transits plus Vedic Gochara for that day.",
  "year-ahead":
    "Twelve monthly themes for one calendar year, plus the longer dasha and Ziwei period layers.",
  comparison:
    "Two charts side by side, read through their cross-aspects. Dynamics only, never a verdict.",
};

export default function ReportsClient() {
  const { user, credits, loading, refresh } = useAuth();
  const [type, setType] = useState<ReportType>("transit");
  // Segment and button colours bypass the theme tokens, so track the
  // document theme the same way the credits page does, 2026-11-04.
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const sync = () =>
      setSiteTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const [birth, setBirth] = useState<BirthFormState>(emptyBirth);
  const [birthB, setBirthB] = useState<BirthFormState>(emptyBirth);
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  // Phase D: failedCall marks a genuine call failure (not validation
  // or a balance stop) and drives the persistent retry UI; toastOpen
  // drives the transient toast on top of it.
  const [failedCall, setFailedCall] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [result, setResult] = useState<SavedReport | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState<SavedReport[]>([]);

  const loadSaved = async () => {
    if (user) {
      const res = await fetch("/api/reports").catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setSaved(Array.isArray(data.reports) ? data.reports : []);
      }
    } else {
      setSaved(getReports());
    }
  };

  useEffect(() => {
    // Phase 4C lint: the load is deferred a microtask past the effect.
    // loadSaved sets state only after its await (server) or
    // synchronously for guests, so the deferral keeps both paths out
    // of the effect body.
    if (!loading) queueMicrotask(() => void loadSaved());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const outOfOracles = !loading && credits !== null && credits < 1;

  async function saveGenerated(report: SavedReport) {
    if (user) {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      }).catch(() => null);
      if (!res || !res.ok) {
        setSaveError(true);
        return;
      }
      setSaveError(false);
      await loadSaved();
    } else {
      saveReport(report);
      setSaved(getReports());
    }
  }

  async function generate() {
    setError("");
    setSaveError(false);
    setResult(null);
    // Phase D: a new attempt clears the previous failure UI.
    setFailedCall(false);
    setToastOpen(false);
    if (!birth.date) {
      setError("Please enter a birth date.");
      return;
    }
    // AF-066: the form starts empty, so an empty hour or city must
    // say so instead of silently becoming midnight in Manila.
    if (!birth.unknownTime && birth.hour === "") {
      setError("Please enter a birth hour, or tick birth time unknown.");
      return;
    }
    if (
      birth.latitude === "" ||
      birth.longitude === "" ||
      !Number.isFinite(Number(birth.latitude)) ||
      !Number.isFinite(Number(birth.longitude))
    ) {
      setError("Please choose a birth city.");
      return;
    }
    if (type === "year-ahead" && birth.gender === "") {
      setError("A year-ahead reading needs a gender for its Ziwei annual layer.");
      return;
    }
    if (type === "comparison" && !birthB.date) {
      setError("Please enter a birth date for the second chart.");
      return;
    }
    setGenerating(true);
    try {
      const body: Record<string, unknown> =
        type === "transit"
          ? { type, birth: birthPayload(birth), targetDate }
          : type === "year-ahead"
            ? { type, birth: birthPayload(birth), year: Number(year) }
            : { type, birthA: birthPayload(birth), birthB: birthPayload(birthB) };
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Phase D: every failure message states that no Oracle was
        // spent (the route spends only after success), but only a
        // genuine call failure gets the toast and retry UI. A 402 is
        // a balance stop: the paragraph plus the Top up link guide it.
        const msg = typeof data.error === "string" ? data.error : "The report could not be generated.";
        setError(msg.includes("spent") ? msg : `${msg} No Oracle was spent.`);
        if (res.status !== 402) {
          setFailedCall(true);
          setToastOpen(true);
        }
        return;
      }
      const report = data.report as SavedReport;
      // Phase E (item 2): keep the serving model the API returned, so
      // the report view can label it instead of discarding it.
      if (typeof data.model === "string" && data.model) report.model = data.model;
      if (!user) {
        if (!spendCredit(1)) {
          setError("Your device wallet could not cover this report. Please top up and try again. No Oracle was spent.");
          return;
        }
        window.dispatchEvent(new Event("sortes:credits-changed"));
      }
      setResult(report);
      await saveGenerated(report);
      if (user) await refresh();
    } catch {
      setError("The report could not be generated just now. No Oracle was spent. Please try again in a moment.");
      setFailedCall(true);
      setToastOpen(true);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">Reports</p>
      <h1 className="mt-2 text-center font-display text-5xl text-goldbright">Keep-forever reports</h1>
      <p className="mt-3 text-center text-cream/80">
        1 Oracle per report. Reports never expire.
      </p>
      {/* Phase E (item 9): delivery format and length, stated before
          anyone spends an Oracle. */}
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-mist">
        Delivered on screen, printable as PDF,
        plus the tables for your type.
      </p>
      <p className="mt-2 text-center text-sm text-mist">
        Birth details are used only for this report, never stored, never sent to AI.
      </p>

      {!loading && credits !== null && (
        <p className="mt-4 text-center text-sm text-cream">
          Your balance: <strong className="text-goldbright"><Counter value={credits} fontSize={14} /> {credits === 1 ? "Oracle" : "Oracles"}</strong>
          {user ? null : " (device wallet; sign in to keep reports on your account)"}
        </p>
      )}

      <div className="mt-8 flex justify-center">
        <RubberSegment
          items={[
            { value: "transit", label: "Transit report" },
            { value: "year-ahead", label: "Year-ahead reading" },
            { value: "comparison", label: "Relationship comparison" },
          ]}
          value={type}
          onChange={(v) => {
            setType(v as ReportType);
            setResult(null);
            setError("");
          }}
          aria-label="Report type"
          trackColor={siteTheme === "light" ? "#ffffff" : "#1a1f2e"}
          thumbColor="#d4af37"
          textColor={siteTheme === "light" ? "#45423c" : "#9ca3af"}
          activeTextColor="#0a0e1a"
          className={siteTheme === "light" ? "ring-1 ring-gold/25" : ""}
        />
      </div>
      <p className="mt-3 text-center text-sm text-cream/75">{TYPE_BLURBS[type]}</p>
      <details className="mx-auto mt-4 max-w-xl rounded-2xl border border-gold/20 bg-panel/60 p-4 text-left">
        <summary className="cursor-pointer font-semibold text-goldbright">Read a sample report, before you spend an Oracle</summary>
        <p className="mt-2 text-sm text-cream/80">
          A full sample transit report, written for an invented seeker. Your generated report fills the same shape with your own positions.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cream/80">
          <li>Transit report: interpretation, Western transits on your date, Vedic Gochara.</li>
          <li>Year-ahead reading: interpretation, monthly themes, Dasha outlook, Ziwei annual layer.</li>
          <li>Relationship comparison: interpretation, the two charts, cross-aspects.</li>
        </ul>
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-cream/90">{SAMPLE_TRANSIT_REPORT}</p>
        <p className="mt-3 text-xs italic text-mist">Sample report, invented seeker, invented positions.</p>
      </details>
      {type === "comparison" && (
        <p className="mt-2 text-center text-sm text-mist">
          You enter both charts. Never a prediction about whether a relationship will last.
        </p>
      )}

      <div className="mt-6 space-y-6">
        <BirthForm
          title={type === "comparison" ? "First chart" : "Your birth details"}
          value={birth}
          onChange={setBirth}
          genderRequired={type === "year-ahead"}
        />
        {type === "comparison" && (
          <BirthForm title="Second chart" value={birthB} onChange={setBirthB} genderRequired={false} />
        )}
        {type === "transit" && (
          <div>
            <label htmlFor="report-target-date" className={labelClass}>
              Date for the transit report
            </label>
            <input
              id="report-target-date"
              type="date"
              required
              className={inputClass}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        )}
        {type === "year-ahead" && (
          <div>
            <label htmlFor="report-year" className={labelClass}>
              Year for the year-ahead reading
            </label>
            <input
              id="report-year"
              type="number"
              min={1900}
              max={2200}
              required
              className={inputClass}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        )}
      </div>

      {outOfOracles && (
        <div className="mt-6 rounded-2xl border border-gold/25 bg-panel/70 p-4 text-center text-sm text-cream">
          You are out of Oracles. Reports cost 1 Oracle each.{" "}
          <Link href="/oracles" className="font-semibold text-goldbright underline">
            Get Oracles
          </Link>
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-2xl border border-danger/40 bg-panel/70 p-4 text-center text-sm text-danger">
          {error}{" "}
          {error.includes("1 Oracle") && (
            <Link href="/oracles" className="font-semibold underline">
              Get Oracles
            </Link>
          )}
        </div>
      )}

      {failedCall && (
        <div className="mt-4 space-y-3">
          <SwipeToast
            open={toastOpen}
            onClose={() => setToastOpen(false)}
            title="Report failed"
            actionLabel="Retry"
            onAction={generate}
            inline
            closeButton
            width={320}
            background="#1a1f2e"
            color="#ede6d6"
            fuseColor="#d4af37"
          />
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="w-full rounded-xl border border-gold/40 px-4 py-3 text-sm font-semibold text-goldbright hover:bg-gold/15 disabled:opacity-100 disabled:saturate-50"
          >
            Try again
          </button>
        </div>
      )}

      <SpecularButton
        type="button"
        onClick={generate}
        disabled={generating || outOfOracles}
        className="mt-6 w-full"
        baseColor={siteTheme === "light" ? "#ffffff" : "#1a1f2e"}
        lineColor={siteTheme === "light" ? "#8a6d0a" : "#d4af37"}
        textColor={siteTheme === "light" ? "#1c1a15" : "#ede6d6"}
        tint="#d4af37"
      >
        {generating ? "Generating…" : "Generate report · 1 Oracle"}
      </SpecularButton>
      {generating && (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-cream/75">
          <StatusMark status="running" size={20} color="#d4af37" />
          Writing your report…
        </p>
      )}
      {(generating || failedCall || result) && (
        <div className="mt-3 flex justify-center">
          <CallChip
            name="report"
            argument="generate"
            status={generating ? "running" : failedCall ? "error" : "done"}
            surfaceColor="#1a1f2e"
            color="#ede6d6"
            progressColor="#d4af37"
            onRetry={generate}
          />
        </div>
      )}

      {result && (
        <AnimatedContent trigger="mount" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2} stagger={0.08}>
        <div className="mt-8 rounded-3xl border border-gold/25 bg-panel/70 p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Your report</p>
          <h2 className="mt-1 font-display text-3xl text-goldbright">{result.title}</h2>
          {saveError ? (
            <div className="mt-3 rounded-xl border border-danger/40 p-3 text-sm text-danger">
              The report was generated, but saving it failed. Your Oracle was spent only once; retry the
              save without another charge.{" "}
              <button type="button" onClick={() => saveGenerated(result)} className="font-semibold underline">
                Retry save
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-mist">
              Saved. Open it any time from your reports below, or{" "}
              <Link href={`/reports/${result.id}`} className="font-semibold text-goldbright underline">
                view the full report
              </Link>
              .
            </p>
          )}
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-cream/90">{result.interpretation}</p>
          <p className="mt-3 text-xs text-mist">
            AI-generated
            {result.model ? ` · Written with ${result.model}` : ""}
          </p>
        </div>
        </AnimatedContent>
      )}

      <div className="mt-12">
        <h2 className="font-display text-3xl text-goldbright">Your saved reports</h2>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-mist">
            No saved reports yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {saved.map((r) => (
              <li key={r.id} className="rounded-2xl border border-gold/25 bg-panel/70 p-4">
                <Link href={`/reports/${r.id}`} className="font-display text-xl text-cream hover:text-goldbright">
                  {r.title}
                </Link>
                <p className="text-xs text-mist">
                  {new Date(r.createdAt).toLocaleDateString()} · {r.type === "transit" ? "Transit report" : r.type === "year-ahead" ? "Year-ahead reading" : "Relationship comparison"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

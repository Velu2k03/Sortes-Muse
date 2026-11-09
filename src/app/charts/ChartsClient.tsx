"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { WesternResult, ZiweiResult } from "@/lib/charts";
import type { VedicResult } from "@/lib/vedic";
import type { ZiweiLanguage } from "@/lib/ziwei-i18n";
import { localizeStar, zodiacEn, ZIWEI_LEGEND_ZH } from "@/lib/ziwei-i18n";
import ThemedDatePicker from "@/components/ThemedDatePicker";
import { formatUtcOffset } from "@/lib/format-offset";
import CardBurst from "@/components/CardBurst";
// Phase 4C (4.8a): the chart renderers are code-split. Every one of
// them renders only after a chart is cast (behind `result`), so they
// are separate chunks loaded on demand instead of first-paint weight
// on the birth-data form. Plain dynamic() (SSR kept): these are
// client components rendered conditionally, so there is no SSR
// behaviour to preserve or lose, and no ssr:false is needed.
import type { ZiweiView } from "@/components/ZiweiChartBoard";
const ZiweiChartBoard = dynamic(() => import("@/components/ZiweiChartBoard"));
const WesternWheel = dynamic(() => import("@/components/WesternWheel"));
const WesternTransits = dynamic(() => import("@/components/WesternTransits"));
const VedicTransits = dynamic(() => import("@/components/VedicTransits"));
const ZiweiStacks = dynamic(() => import("@/components/ZiweiStacks"));
const VedicChart = dynamic(() => import("@/components/VedicChart"));
import { useAuth } from "@/components/AuthProvider";
import Icon from "@/components/Icon";
import GlideSelect from "@/components/GlideSelect";
import SplitText from "@/components/SplitText";
import AnimatedContent from "@/components/AnimatedContent";
import SwipeToast from "@/components/SwipeToast";
import { chartFreeUsed, markChartFreeUsed, makeReading, type ChartFreeSystem } from "@/lib/storage";
import HeirloomPrint from "@/components/HeirloomPrint";
import BirthProfilePicker from "@/components/BirthProfilePicker";
import { profileToChartFields } from "@/lib/birth-profiles";
import { chartInterpretationCost } from "@/lib/chart-pricing";
import { buildStaticChartInterpretation } from "@/lib/chart-fallback";
import PageHeader from "@/components/PageHeader";

type ChartResult = ZiweiResult | WesternResult | VedicResult;
type ChartSystem = "ziwei" | "western" | "vedic";

const FOCUS_AREAS = ["general", "love", "career", "finances", "academics", "health"] as const;

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

export default function ChartsClient() {
  const { credits, spend, add, persistReading, user, refresh } = useAuth();
  const [system, setSystem] = useState<ChartSystem>("western");
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // GlideSelect takes hard colours, so track the document theme the
  // same way the credits page does for PixelCard.
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const sync = () =>
      setSiteTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const SYSTEM_ORDER: ChartSystem[] = ["western", "ziwei", "vedic"];
  // Phase F: one plain line per system under the picker, mirroring the
  // reports page blurbs, so a newcomer picks by meaning, not by name.
  const SYSTEM_BLURBS: Record<ChartSystem, string> = {
    western: "Tropical zodiac, the familiar Sun-sign system, with Placidus houses.",
    vedic: "Sidereal zodiac, Moon-centered, with whole-sign houses and dasha periods.",
    ziwei: "Chinese Purple Star astrology: palaces, stars, and life periods.",
  };
  const formRef = useRef<HTMLFormElement | null>(null);
  // Traditional square is the default Ziwei view: it passed the re-audit
  // cleanly, while the ring edge labels still crowd and overlap. Ring
  // stays as an alternative toggle, it is not removed.
  const [ziweiView, setZiweiView] = useState<ZiweiView>("square");
  const [placeSearch, setPlaceSearch] = useState("");
  const [placeStatus, setPlaceStatus] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);
  // Query last resolved by Find, so Calculate can spot a typed place
  // that was never looked up and resolve it first instead of silently
  // calculating with the preset coordinates.
  const [placeResolvedFor, setPlaceResolvedFor] = useState<string | null>(null);
  const [focus, setFocus] = useState<(typeof FOCUS_AREAS)[number]>("general");
  const [question, setQuestion] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [interpFallback, setInterpFallback] = useState(false);
  // Phase E (item 2): the serving model the API returned for this
  // interpretation, so the label and the saved reading can name it
  // instead of discarding it. Null until an AI interpretation arrives;
  // the deterministic standard fallback has no model.
  const [interpModel, setInterpModel] = useState<string | null>(null);
  const [interpLoading, setInterpLoading] = useState(false);
  const [interpError, setInterpError] = useState("");
  // Phase D: interpFailed marks a genuine call failure (not a balance
  // stop) and drives the persistent retry UI; the toast flag drives
  // the transient toast on top of it.
  const [interpFailed, setInterpFailed] = useState(false);
  const [interpToastOpen, setInterpToastOpen] = useState(false);
  const [interpFree, setInterpFree] = useState(false);
  // Server free status for signed-in users (null until fetched).
  // Guests never call the status endpoint; they use device flags.
  const [serverFree, setServerFree] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState("");
  // AF-060: the form starts empty. No 08:00, no Female, no Manila
  // coordinates: a prefilled form reads as the seeker's own data.
  const [time, setTime] = useState("");
  const [unknownTime, setUnknownTime] = useState(false);
  // Phase 4B (4.3): optional IANA timezone override. Blank means
  // auto-detect from the birthplace coordinates; a wrong auto-detected
  // zone can be corrected here and the chart recalculated.
  const [timeZoneOverride, setTimeZoneOverride] = useState("");
  // AF-060/AF-066: gender starts unchosen, the same "" / Male /
  // Female / "Prefer not to say" set as /reports. Ziwei needs a
  // choice at submit (the engine places stars by gender); Western
  // and Vedic do not use it, so "" is sent as the API default there.
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [preset, setPreset] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  // Deep UX Batch A2: per-system cache. Switching system used to
  // wipe the result, interpretation, and saved state, so comparing
  // systems meant re-entering everything. The cache keeps one
  // snapshot per system and restores it on switch.
  // Codex review on PR 50, correct: a cache keyed only by system
  // restored an old result after the birth inputs changed, so the
  // result could appear to match new form values. The snapshot now
  // carries the input fingerprint and restores only when it matches.
  // Fresh Codex review on PR 50, correct: the fingerprint must also
  // cover focus and question, because a saved interpretation is tied
  // to them, not only to the birth inputs.
  const inputFingerprint = [date, time, unknownTime, gender, latitude, longitude, timeZoneOverride, focus, question].join("|");
  // Fresh Codex review on PR 50, correct: the cache writer must only
  // store a result under the fingerprint it was calculated with. An
  // edited field changes inputFingerprint while the old result is
  // still on screen, and writing it under the new fingerprint would
  // later restore a chart for the wrong inputs.
  const calcFingerprintRef = useRef<string>("");
  // Codex fresh review on PR 50, correct: if the user clicks Clear
  // remembered birth details while a calculation is still pending,
  // the success continuation below must not write the old details
  // back and silently undo that clear. The epoch is bumped on every
  // clear, and the continuation only lands when it is unchanged.
  const birthSaveEpochRef = useRef(0);
  // Tracks the latest selected system for the pending-calculation
  // guard in onSubmit: a ref, not the submit-time closure, so a
  // switch made while the request is in flight is visible.
  const systemRef = useRef(system);
  useEffect(() => {
    systemRef.current = system;
  }, [system]);
  // Codex re-review, correct: the retry flags are per-system state
  // too. Without them in the snapshot, switching from a failed
  // system to a cached successful one left a stale Retry action
  // that could spend an Oracle on an already-successful chart.
  const systemCache = useRef<Record<string, { result: ChartResult | null; interpretation: string; interpError: string; saved: boolean; fingerprint: string; interpFree: boolean; interpFallback: boolean; interpFailed: boolean; interpToastOpen: boolean; interpModel: string | null }>>({});
  const selectSystem = (s: ChartSystem) => {
    const cached = systemCache.current[s];
    setSystem(s);
    if (cached && cached.fingerprint === inputFingerprint) {
      setResult(cached.result);
      setInterpretation(cached.interpretation);
      setInterpError(cached.interpError);
      setSaved(cached.saved);
      // Codex fresh review on PR 50, correct: the free/fallback
      // badges and the saved free/aiGenerated values are per-system,
      // so they must be restored with the interpretation, not left
      // over from the system just switched away from.
      setInterpFree(cached.interpFree);
      setInterpFallback(cached.interpFallback);
      setInterpFailed(cached.interpFailed);
      setInterpToastOpen(cached.interpToastOpen);
      setInterpModel(cached.interpModel);
      calcFingerprintRef.current = cached.fingerprint;
    } else {
      setResult(null);
      setInterpretation("");
      setInterpError("");
      setSaved(false);
      setInterpFailed(false);
      setInterpToastOpen(false);
      setInterpModel(null);
    }
    // Picking a system brings the form up into view, so the fields
    // for the new system are right there instead of leaving the
    // user staring at the wheel.
    formRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ChartResult | null>(null);
  // Cache writer lives here, after result and saved are declared,
  // so TypeScript does not flag use before assignment.
  useEffect(() => {
    if (inputFingerprint !== calcFingerprintRef.current) return;
    systemCache.current[system] = { result, interpretation, interpError, saved, fingerprint: inputFingerprint, interpFree, interpFallback, interpFailed, interpToastOpen, interpModel };
  }, [system, result, interpretation, interpError, saved, inputFingerprint, interpFree, interpFallback, interpFailed, interpToastOpen, interpModel]);
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
    // Phase 4C lint: setState deferred a microtask past the effect,
    // the same pattern the ziwei-lang restore below already uses, so
    // the burst still fires once per new result with no extra render
    // cascade. The hide timer was already a callback, not flagged.
    queueMicrotask(() => setShowBurst(true));
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
  // Deep UX Batch A2: restore remembered birth details once, only
  // when the form is still blank, so a deliberate clear is respected.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("sortes-birth-details");
      if (!raw) return;
      const saved = JSON.parse(raw) as { date?: string; time?: string; unknownTime?: boolean; gender?: "male" | "female"; preset?: string; latitude?: string; longitude?: string; timeZone?: string };
      // Phase 4C lint: the restore sets state a microtask past the
      // mount effect (same pattern as the ziwei-lang restore), so the
      // form paints blank once and fills immediately after, exactly
      // as the synchronous version did, with no cascading render.
      queueMicrotask(() => {
        if (saved.date) setDate(saved.date);
        if (saved.time) setTime(saved.time);
        if (typeof saved.unknownTime === "boolean") setUnknownTime(saved.unknownTime);
        if (saved.gender) setGender(saved.gender);
        if (saved.preset) setPreset(saved.preset);
        if (saved.latitude) setLatitude(saved.latitude);
        if (saved.longitude) setLongitude(saved.longitude);
        if (saved.timeZone) setTimeZoneOverride(saved.timeZone);
      });
    } catch {}
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
    setTimeZoneOverride("");
    setPreset(PRESETS[0].label);
    setLatitude(String(PRESETS[0].latitude));
    setLongitude(String(PRESETS[0].longitude));
  }

  async function lookupPlace(): Promise<{ latitude: number; longitude: number } | null> {
    if (!placeSearch.trim()) {
      setPlaceStatus("Type a place name first, for example a city.");
      return null;
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
      setPlaceResolvedFor(placeSearch.trim());
      setPlaceStatus(`Found coordinates: ${data.latitude}, ${data.longitude}. The place name itself is not stored or sent to AI.`);
      return { latitude: data.latitude, longitude: data.longitude };
    } catch (err) {
      setPlaceStatus(err instanceof Error ? err.message : "Place lookup failed.");
      return null;
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
      const rising = r.ascendantSign ? ` Rising: ${r.ascendantSign}.` : ` Birth time unknown: Rising and houses withheld.`;
      return `Vedic chart. Sun: ${r.sunSign}. Moon: ${r.moonSign}, ${r.moonNakshatra} pada ${r.moonNakshatraPada}.${rising}`;
    }
    const angles = r.ascendantSign && r.midheavenSign
      ? ` Rising: ${r.ascendantSign}. Midheaven: ${r.midheavenSign}.`
      : ` Birth time unknown: Rising, Midheaven, and houses withheld.`;
    return `Western chart. Sun: ${r.sunSign}.${angles}`;
  }

  // Server free status for signed-in users, so the button label
  // matches what the route will actually charge. Refetched whenever
  // the calculated system changes.
  useEffect(() => {
    if (!user || !result) {
      // Phase 4C lint: reset deferred a microtask past the effect.
      queueMicrotask(() => setServerFree(null));
      return;
    }
    let cancelled = false;
    fetch(`/api/chart/interpret?system=${result.system}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.free === "boolean") setServerFree(d.free);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Phase 4C lint: the effect refetches only when the calculated
    // system changes. Depending on the whole result object would
    // refetch on every recalculation of the same system, so
    // result?.system is the intentional dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, result?.system]);

  // Label truth: the server is the authority for signed-in users
  // (serverFree once fetched, device flag while loading); guests use
  // their device-local flag.
  const deviceFree = result
    ? chartInterpretationCost(chartFreeUsed(result.system as ChartFreeSystem)) === 0
    : false;
  const displayFree = user ? (serverFree ?? deviceFree) : deviceFree;

  async function onInterpret() {
    if (!result) return;
    setInterpError("");
    setInterpLoading(true);
    // Phase D: a new attempt clears the previous failure UI.
    setInterpFailed(false);
    setInterpToastOpen(false);
    // M0.1 credit authority: signed-in users never spend client-side.
    // The route spends server-side only after a real model generates
    // text (or marks the server free use), so a failed generation can
    // never cost a credit. Guests keep the device-local wallet and its
    // pre-spend plus catch refund.
    const signedIn = !!user;
    const guestFree = chartInterpretationCost(chartFreeUsed(result.system as ChartFreeSystem)) === 0;
    let guestSpent = false;
    try {
      if (!signedIn && !guestFree) {
        // AF-013: an unresolved balance is not an empty balance.
        if (credits === null) {
          throw new Error("Still checking your Oracle balance. Please try again in a moment.");
        }
        if (credits < 1) {
          throw new Error("You need 1 Oracle for this interpretation. The calculation above stays free. Top up from the Oracles page.");
        }
        const ok = await spend(1);
        if (!ok) throw new Error("Could not spend 1 Oracle. Your balance was not changed by this page.");
        guestSpent = true;
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
      // Phase E (item 2): keep the serving model; the fallback has none.
      setInterpModel(
        !data.fallback && typeof data.model === "string" && data.model ? data.model : null
      );
      // The server is the authority for signed-in free status; guests
      // keep their device-local flag.
      const wasFree = signedIn ? Boolean(data.free) : guestFree;
      setInterpFree(wasFree);
      if (!signedIn && guestFree) markChartFreeUsed(result.system as ChartFreeSystem);
      if (signedIn) {
        // A successful signed-in interpretation consumes the free use
        // (or was paid), so the label must stop saying free.
        setServerFree(false);
        await refresh();
      }
    } catch (err) {
      // Guest refund only: guests pre-spent from the device wallet.
      // Signed-in users spent nothing client-side.
      if (guestSpent) await add(1);
      // Phase D: balance stops keep their own message (they already
      // say the balance was not changed). A genuine call failure gets
      // the no-charge line plus the toast and retry UI.
      const message = err instanceof Error ? err.message : "Could not interpret this chart.";
      const isBalance =
        message.startsWith("You need 1 Oracle") || message.startsWith("Could not spend");
      if (isBalance) {
        setInterpError(message);
      } else {
        setInterpError(message.includes("spent") ? message : `${message} No Oracle was spent.`);
        setInterpFailed(true);
        setInterpToastOpen(true);
        // Phase 2, 2.3: the AI failed, so show the deterministic
        // standard interpretation built from the computed placements
        // instead of leaving only an error. It is labelled as
        // standard, not AI-generated, and it spends nothing: a guest
        // pre-spend was refunded above, a signed-in user spent
        // nothing client-side, and the free use is untouched, so a
        // retry stays free when it was. The retry UI stays live.
        setInterpretation(buildStaticChartInterpretation(result, focus));
        setInterpFallback(true);
        setInterpModel(null);
      }
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
      // Phase E (item 2): the serving model for an AI interpretation;
      // the standard fallback has none, so the reading page labels it
      // by its aiGenerated flag instead.
      model: !interpFallback && interpModel ? interpModel : undefined,
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
      // Phase 4C (4.8a): html-to-image loads only when the seeker
      // actually exports a chart image, not on first paint.
      const { toPng } = await import("html-to-image");
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
    setInterpModel(null);
    setInterpError("");
    setSaved(false);
    if (!date) {
      setError("Please choose a birth date.");
      return;
    }
    // AF-060: Ziwei places stars by gender, so it needs a choice;
    // Western and Vedic do not use gender at all.
    if (system === "ziwei" && gender === "") {
      setError("Please choose a gender for the Ziwei chart, or pick Western or Vedic instead.");
      return;
    }
    // A typed place that was never resolved must not calculate with
    // the preset coordinates. Resolve it first, and stop on failure
    // so the user sees the lookup error instead of a wrong chart.
    let calcLatitude = Number(latitude);
    let calcLongitude = Number(longitude);
    if (placeSearch.trim() && placeResolvedFor !== placeSearch.trim()) {
      if (placeBusy) {
        setError("The place lookup is still running. Please wait a moment, then try again.");
        return;
      }
      const found = await lookupPlace();
      if (!found) {
        setError("Could not find that place. Check the name, or press Find again.");
        return;
      }
      calcLatitude = found.latitude;
      calcLongitude = found.longitude;
    }
    // AF-060: the form starts empty, so a place is required: without
    // coordinates there is nothing to calculate from.
    if (!Number.isFinite(calcLatitude) || !Number.isFinite(calcLongitude)) {
      setError("Please choose a birthplace, or search for a place and press Find.");
      return;
    }
    let hour: number | null = null;
    let minute = 0;
    if (!unknownTime) {
      // Native time input, but a cleared field submits an empty
      // string, and Number("") is 0, so an empty time would silently
      // become 00:00. Require the HH:MM shape instead.
      if (!/^\d{2}:\d{2}$/.test(time)) {
        setError("Please choose a birth time, or tick unknown time.");
        return;
      }
      const parts = time.split(":");
      hour = Number(parts[0]);
      minute = Number(parts[1] ?? 0);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        setError("Please choose a valid birth time, or tick unknown time.");
        return;
      }
    }
    setLoading(true);
    const saveEpoch = birthSaveEpochRef.current;
    // Codex re-review, correct: if the user switches systems while
    // this calculation is pending, the response belongs to the old
    // system. Landing it under the new system would show a Ziwei
    // result as Western and cache it under Western.
    const requestSystem = system;
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
          // AF-066: only Ziwei uses gender; "" (Prefer not to say)
          // is sent as the API default for the other systems.
          gender: system === "ziwei" ? gender : "female",
          latitude: calcLatitude,
          longitude: calcLongitude,
          timeZone: timeZoneOverride.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not calculate this chart.");
      // A clear made while this request was in flight wins: landing
      // the old result and details would undo it, so skip the landing
      // and leave the cleared form alone. Same for a system switch:
      // a response for another system is discarded, not landed.
      if (saveEpoch === birthSaveEpochRef.current && requestSystem === systemRef.current) {
        calcFingerprintRef.current = inputFingerprint;
        setResult(data.result as ChartResult);
        // Deep UX Batch A2: remember birth details on this device so
        // a return visit does not start from a blank form. Raw birth
        // data stays on device in localStorage, it is not sent anywhere
        // except the calculate call the user already makes.
        try {
          window.localStorage.setItem("sortes-birth-details", JSON.stringify({ date, time, unknownTime, gender, preset, latitude, longitude, timeZone: timeZoneOverride.trim() || undefined }));
        } catch {}
      }
      // A clear control lives in the form reset path, not here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not calculate this chart.");
    } finally {
      setLoading(false);
    }
  }

  // AF-060: the saved-profile picker and the Clear control only
  // appear once there is data to save or clear. A first-time visitor
  // sees the form, not controls for a past they do not have.
  const hasData =
    date !== "" || time !== "" || placeSearch !== "" || preset !== "" || result !== null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
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

      {hasData && (
      <>
      <div className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-mist">
          Your birth details are remembered on this device after a successful calculation.
        </p>
        <button
          type="button"
          onClick={() => {
            birthSaveEpochRef.current += 1;
            try { window.localStorage.removeItem("sortes-birth-details"); } catch {}
            setDate("");
            setTime("");
            setUnknownTime(false);
            setTimeZoneOverride("");
            setPreset("");
            setLatitude("");
            setLongitude("");
            setResult(null);
            setInterpretation("");
            setSaved(false);
          }}
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
      )}
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
              <div role="group" className="mt-1 flex flex-wrap gap-3" aria-label="Gender">
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
              </div>
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

      {result && (
        <AnimatedContent trigger="mount" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2} stagger={0}>
        <section ref={resultRef} className="num magic-glow relative mt-10 scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/40 p-4 sm:p-6" aria-live="polite">
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
          {result.system === "ziwei" && (
            <>

              <div role="group" className="mt-4 flex flex-wrap gap-3" aria-label="Chart language">
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
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-cream/80">
                <input type="checkbox" checked={showGlosses} onChange={(e) => setShowGlosses(e.target.checked)} />
                Show Chinese glosses (default off in English, on in Chinese)
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-3 text-sm font-bold text-goldbright disabled:opacity-100 disabled:saturate-50">
                  {shareBusy ? "Creating image…" : (<span className="inline-flex items-center gap-2"><Icon name="share" size={16} />Share chart as image</span>)}
                </button>
              </div>
              <div role="group" className="mt-3 flex flex-wrap gap-3" aria-label="Ziwei chart view">
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
              </div>
              {result.solarCorrectionMinutes !== 0 && (
                <p className="mt-3 text-sm text-cream/75">
                  {result.timeBasis === "iana"
                    ? `Timezone ${result.timeZone ?? ""} (${formatUtcOffset(result.utcOffsetMinutes ?? 0)}) applied, then longitude correction to solar time: ${result.solarCorrectionMinutes > 0 ? "+" : ""}${result.solarCorrectionMinutes} minutes, corrected time ${result.solarCorrectedTime}. Equation of time is not applied.`
                    : `Longitude correction applied: ${result.solarCorrectionMinutes > 0 ? "+" : ""}${result.solarCorrectionMinutes} minutes, corrected time ${result.solarCorrectedTime}. No timezone could be resolved, so DST and historical timezones are not applied; equation of time is not applied either.`}
                </p>
              )}
            </>
          )}
          {result.system !== "ziwei" && (
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={onShareChart} disabled={shareBusy} className="rounded-full border border-gold/40 px-5 py-3 text-sm font-bold text-goldbright disabled:opacity-100 disabled:saturate-50">
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

          {/* Chart glossary, 2026-11-05: Western and Vedic charts
              show positions, aspects, and houses with no beginner
              glossary, while Ziwei already has its own legend below.
              Plain definitions, collapsed by default, no new data. */}
          {result.system !== "ziwei" && (
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
          )}

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
                <div role="group" className="mt-1 flex flex-wrap gap-2" aria-label="Focus area">
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
                </div>
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
            <button type="button" onClick={onInterpret} disabled={interpLoading} className="btn-gold mt-5 rounded-full px-6 py-3 text-sm font-bold disabled:opacity-100 disabled:saturate-50">
              {interpLoading ? "Interpreting…" : displayFree ? "Get interpretation (free)" : "Get interpretation (1 Oracle)"}
            </button>
            {interpretation && (
              <div className="mt-6">
                <p className="text-xs uppercase tracking-widest text-gold">
                  {interpFallback
                    ? "Standard interpretation · prepared from your chart positions, not AI-generated"
                    : `${interpFree ? "Free interpretation" : "1 Oracle interpretation"} · Personalized · AI-generated${interpModel ? ` · Written with ${interpModel}` : ""}`}
                </p>
                <p className="mt-3 whitespace-pre-wrap leading-relaxed text-cream/90">{interpretation}</p>
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
                      { heading: "Interpretation", body: interpretation },
                    ]}
                  />
                </div>
              </div>
            )}
          </section>
        </section>
        </AnimatedContent>
      )}
    </div>
  );
}

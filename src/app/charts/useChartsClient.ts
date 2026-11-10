"use client";

import { useEffect, useRef, useState } from "react";
import type { ZiweiLanguage } from "@/lib/ziwei-i18n";
import type { ZiweiView } from "@/components/ZiweiChartBoard";
import { useAuth } from "@/components/AuthProvider";
import { chartFreeUsed, makeReading, newId, type ChartFreeSystem } from "@/lib/storage";
import { unconfirmedMessage } from "@/lib/generate-failure";
import { chartInterpretationCost } from "@/lib/chart-pricing";
import { buildStaticChartInterpretation } from "@/lib/chart-fallback";
import {
  FOCUS_AREAS,
  PRESETS,
  birthFormError,
  chartSummaryText,
  parseBirthTime,
  type ChartResult,
  type ChartSystem,
} from "@/lib/chart-submit";

/*
 * F10 (2026-11-09): ChartsClient state, moved verbatim into three
 * hooks by concern. Effects keep their original relative order within
 * each hook; none of them depends on another hook's effect.
 */

/** Display preferences: reduced motion, site theme, Ziwei view/language/glosses. */
/** An error whose message came from the server's own response body. */
class ServerError extends Error {}

export function useChartPrefs() {
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
  // Traditional square is the default Ziwei view: it passed the re-audit
  // cleanly, while the ring edge labels still crowd and overlap. Ring
  // stays as an alternative toggle, it is not removed.
  const [ziweiView, setZiweiView] = useState<ZiweiView>("square");
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

  return { reducedMotion, siteTheme, ziweiView, setZiweiView, ziweiLang, showGlosses, setShowGlosses, setZiweiLangSaved };
}

export type ChartPrefs = ReturnType<typeof useChartPrefs>;

/** The shared birth-data form: fields, place lookup, remembered details. */
export function useChartForm() {
  const [placeSearch, setPlaceSearch] = useState("");
  const [placeStatus, setPlaceStatus] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);
  // Query last resolved by Find, so Calculate can spot a typed place
  // that was never looked up and resolve it first instead of silently
  // calculating with the preset coordinates.
  const [placeResolvedFor, setPlaceResolvedFor] = useState<string | null>(null);
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
  // Codex fresh review on PR 50, correct: if the user clicks Clear
  // remembered birth details while a calculation is still pending,
  // the success continuation below must not write the old details
  // back and silently undo that clear. The epoch is bumped on every
  // clear, and the continuation only lands when it is unchanged.
  const birthSaveEpochRef = useRef(0);
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
  // A typed place that was never resolved must not calculate with
  // the preset coordinates. Resolve it first, and stop on failure
  // so the user sees the lookup error instead of a wrong chart.
  // AF-060: the form starts empty, so a place is required: without
  // coordinates there is nothing to calculate from.
  async function resolveCalcCoordinates(): Promise<
    { latitude: number; longitude: number } | { error: string }
  > {
    let calcLatitude = Number(latitude);
    let calcLongitude = Number(longitude);
    if (placeSearch.trim() && placeResolvedFor !== placeSearch.trim()) {
      if (placeBusy) {
        return { error: "The place lookup is still running. Please wait a moment, then try again." };
      }
      const found = await lookupPlace();
      if (!found) {
        return { error: "Could not find that place. Check the name, or press Find again." };
      }
      calcLatitude = found.latitude;
      calcLongitude = found.longitude;
    }
    if (!Number.isFinite(calcLatitude) || !Number.isFinite(calcLongitude)) {
      return { error: "Please choose a birthplace, or search for a place and press Find." };
    }
    return { latitude: calcLatitude, longitude: calcLongitude };
  }

  // Deep UX Batch A2: remember birth details on this device so
  // a return visit does not start from a blank form. Raw birth
  // data stays on device in localStorage, it is not sent anywhere
  // except the calculate call the user already makes.
  function rememberBirthDetails() {
    try {
      window.localStorage.setItem("sortes-birth-details", JSON.stringify({ date, time, unknownTime, gender, preset, latitude, longitude, timeZone: timeZoneOverride.trim() || undefined }));
    } catch {}
  }

  return {
    date, setDate, time, setTime, unknownTime, setUnknownTime, timeZoneOverride, setTimeZoneOverride,
    gender, setGender, preset, setPreset, latitude, setLatitude, longitude, setLongitude,
    placeSearch, setPlaceSearch, placeStatus, placeBusy, placeResolvedFor,
    birthSaveEpochRef, useExample, lookupPlace, resolveCalcCoordinates, rememberBirthDetails,
  };
}

export type ChartForm = ReturnType<typeof useChartForm>;

/** System selection, calculation, result cache, interpretation, save and share. */
export function useChartSession(form: ChartForm, prefs: ChartPrefs) {
  const { date, time, unknownTime, timeZoneOverride, gender, preset, latitude, longitude, placeSearch, birthSaveEpochRef, resolveCalcCoordinates, rememberBirthDetails } = form;
  const { reducedMotion, ziweiLang } = prefs;
  const { persistReading, user, refresh } = useAuth();
  const [system, setSystem] = useState<ChartSystem>("western");
  const formRef = useRef<HTMLFormElement | null>(null);
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
  // Batch D (B4): interpretation needs sign-in; set on a 401 (for example an
  // expired session) so the panel shows a sign-in prompt, not a generic error.
  const [interpSignInNeeded, setInterpSignInNeeded] = useState(false);
  // Server free status for signed-in users (null until fetched).
  // Guests never call the status endpoint; they use device flags.
  const [serverFree, setServerFree] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
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

  // Failure path of onInterpret: pick the right message. Nothing is spent
  // client-side (the route spends only after a real generation).
  // Point 1: one interpretation id per attempt; a retry of the same chart and
  // question reuses it, so a row the server already saved is replayed.
  const interpAttempt = useRef<{ key: string; id: string } | null>(null);

  function handleInterpretFailure(err: unknown, result: ChartResult) {
    // Phase D: balance stops keep their own message (they already
    // say the balance was not changed). A genuine call failure gets
    // the no-charge line plus the toast and retry UI.
    const message = err instanceof Error ? err.message : "Could not interpret this chart.";
    const isBalance = message.startsWith("You need 1 Oracle");
    if (isBalance) {
      setInterpError(message);
    } else {
      // Only the server may say "not spent" (its error body, shown verbatim).
      // A dropped connection or bad JSON can happen after the server committed.
      setInterpError(
        err instanceof ServerError
          ? message
          : unconfirmedMessage("interpretation", "your journal")
      );
      setInterpFailed(true);
      setInterpToastOpen(true);
      // Phase 2, 2.3: the AI failed, so show the deterministic
      // standard interpretation built from the computed placements
      // instead of leaving only an error. It is labelled as
      // standard, not AI-generated, and it spends nothing: the free
      // use is untouched, so a retry stays free when it was. The
      // retry UI stays live.
      setInterpretation(buildStaticChartInterpretation(result, focus));
      setInterpFallback(true);
      setInterpModel(null);
    }
  }

  async function onInterpret() {
    if (!result) return;
    setInterpError("");
    setInterpLoading(true);
    // Phase D: a new attempt clears the previous failure UI.
    setInterpFailed(false);
    setInterpToastOpen(false);
    // M0.1 credit authority: the client never spends. The route requires
    // sign-in, spends (or claims the free use) only after a real model
    // generates text, and stores the interpretation in the same transaction.
    setInterpSignInNeeded(false);
    try {
      const payload = {
        system: result.system,
        chart: result,
        category: focus,
        question: question.trim(),
        chartSummary: chartSummaryText(result, ziweiLang),
      };
      const key = JSON.stringify(payload);
      if (interpAttempt.current?.key !== key) interpAttempt.current = { key, id: newId() };
      const res = await fetch("/api/chart/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, readingId: interpAttempt.current.id }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setInterpSignInNeeded(true);
        setInterpError("Sign in to get a chart interpretation.");
        return;
      }
      if (!res.ok) throw new ServerError(data.error || "Could not interpret this chart.");
      interpAttempt.current = null;
      setInterpretation(data.interpretation as string);
      setInterpFallback(Boolean(data.fallback));
      // Phase E (item 2): keep the serving model; the fallback has none.
      setInterpModel(
        !data.fallback && typeof data.model === "string" && data.model ? data.model : null
      );
      setInterpFree(Boolean(data.free));
      // A successful interpretation consumes the free use (or was paid),
      // so the label must stop saying free.
      setServerFree(false);
      // The server already saved this row with the spend; mirror it to the
      // local journal under the SAME id (the server copy is not duplicated).
      if (data.reading) {
        await persistReading(data.reading);
        setSaved(true);
      }
      await refresh();
    } catch (err) {
      handleInterpretFailure(err, result);
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
    const formError = birthFormError(date, system, gender);
    if (formError) {
      setError(formError);
      return;
    }
    const coords = await resolveCalcCoordinates();
    if ("error" in coords) {
      setError(coords.error);
      return;
    }
    const calcLatitude = coords.latitude;
    const calcLongitude = coords.longitude;
    const birthTime = parseBirthTime(unknownTime, time);
    if ("error" in birthTime) {
      setError(birthTime.error);
      return;
    }
    const { hour, minute } = birthTime;
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
        rememberBirthDetails();
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

  return {
    system, selectSystem, formRef, focus, setFocus, question, setQuestion,
    interpretation, setInterpretation, interpFallback, interpModel, interpLoading, interpError,
    interpFailed, interpToastOpen, setInterpToastOpen, interpFree, interpSignInNeeded, user, saved, setSaved,
    shareBusy, shareRef, loading, error, result, setResult, showBurst, resultRef,
    displayFree, onInterpret, onSaveChart, onShareChart, onSubmit, hasData,
  };
}

export type ChartSession = ReturnType<typeof useChartSession>;

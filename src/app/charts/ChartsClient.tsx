"use client";

import { useChartForm, useChartPrefs, useChartSession } from "./useChartsClient";
import {
  BirthDetailsBar,
  BirthForm,
  ChartResult,
  ChartsIntro,
  SystemPicker,
} from "./ChartSections";

/**
 * F10 (2026-11-09): a thin shell. State lives in useChartsClient.ts
 * (prefs, the shared birth form, and the calculate/interpret session);
 * each visual section is in ChartSections.tsx; pure helpers are in
 * src/lib/chart-submit.ts. The rendered tree is unchanged, so a
 * system switch keeps the same result section mounted, as before.
 */
export default function ChartsClient() {
  const prefs = useChartPrefs();
  const form = useChartForm();
  const s = useChartSession(form, prefs);
  const { setDate, setTime, setUnknownTime, setTimeZoneOverride, setPreset, setLatitude, setLongitude, birthSaveEpochRef } = form;
  const { setResult, setInterpretation, setSaved, hasData, result } = s;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <ChartsIntro />

      <SystemPicker prefs={prefs} s={s} />

      {hasData && (
        <BirthDetailsBar
          form={form}
          onClear={() => {
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
        />
      )}
      <BirthForm prefs={prefs} form={form} s={s} />

      {result && (
        <ChartResult prefs={prefs} form={form} s={s} result={result} />
      )}
    </div>
  );
}

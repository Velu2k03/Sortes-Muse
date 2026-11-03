"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getReport, deleteReport } from "@/lib/storage";
import type { SavedReport } from "@/lib/reports";
import SplitText from "@/components/SplitText";

export default function ReportDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [report, setReport] = useState<SavedReport | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const id = typeof params.id === "string" ? params.id : "";

  useEffect(() => {
    if (loading || !id) return;
    if (user) {
      fetch(`/api/reports/${id}`)
        .then((res) => {
          if (!res.ok) {
            setNotFound(true);
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (data && data.report) setReport(data.report as SavedReport);
        })
        .catch(() => setNotFound(true));
    } else {
      const local = getReport(id);
      if (!local) setNotFound(true);
      else setReport(local);
    }
  }, [loading, user, id]);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleteError(false);
    if (user) {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" }).catch(() => null);
      if (!res || !res.ok) {
        setDeleteError(true);
        setConfirming(false);
        return;
      }
    } else if (!deleteReport(id)) {
      setDeleteError(true);
      setConfirming(false);
      return;
    }
    router.push("/reports");
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-cream/80">This report was not found. It may have been deleted, or it belongs to a different account.</p>
        <Link href="/reports" className="mt-4 inline-block font-semibold text-goldbright underline">
          Back to reports
        </Link>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-cream/80">Loading your report…</p>
      </div>
    );
  }

  const data = report.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/reports" className="text-sm font-semibold text-goldbright underline">
        Back to reports
      </Link>
      <p className="mt-6 text-xs uppercase tracking-[0.35em] text-gold">
        {report.type === "transit" ? "Transit report" : report.type === "year-ahead" ? "Year-ahead reading" : "Relationship comparison"}
      </p>
      <SplitText tag="h1" text={report.title} className="mt-2 font-display text-5xl text-goldbright" />
      <p className="mt-2 text-sm text-mist">
        Saved {new Date(report.createdAt).toLocaleDateString()} · This report never expires.
      </p>

      <p className="mt-6 whitespace-pre-wrap leading-relaxed text-cream/90">{report.interpretation}</p>

      <div className="mt-10 space-y-8">
        {data.kind === "transit" && (
          <>
            <section>
              <h2 className="font-display text-3xl text-goldbright">Western transits on {data.targetDate}</h2>
              <p className="mt-1 text-sm text-mist">
                Natal Sun {data.sunSign}, natal Moon {data.moonSign}, transit Moon in {data.transits.moonSign}.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm text-cream/90">
                  <thead>
                    <tr className="text-mist">
                      <th className="py-2 pr-3">Transit planet</th>
                      <th className="py-2 pr-3">Aspect</th>
                      <th className="py-2 pr-3">Natal planet</th>
                      <th className="py-2 pr-3">Orb</th>
                      <th className="py-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transits.aspects.map((a, i) => (
                      <tr key={i} className="border-t border-gold/15">
                        <td className="py-2 pr-3">{a.transitPlanet}</td>
                        <td className="py-2 pr-3">{a.aspect}</td>
                        <td className="py-2 pr-3">{a.natalPlanet}</td>
                        <td className="py-2 pr-3">{a.orb}°</td>
                        <td className="py-2">{a.state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.transits.aspects.length === 0 && (
                <p className="mt-2 text-sm text-mist">No transit within orb on this date.</p>
              )}
            </section>
            <section>
              <h2 className="font-display text-3xl text-goldbright">Vedic Gochara</h2>
              <p className="mt-1 text-sm text-mist">
                Panchanga: {data.gochara.panchanga.tithi}, {data.gochara.panchanga.nakshatra},{" "}
                {data.gochara.panchanga.yoga}, {data.gochara.panchanga.vara}, {data.gochara.panchanga.karana}.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm text-cream/90">
                  <thead>
                    <tr className="text-mist">
                      <th className="py-2 pr-3">Planet</th>
                      <th className="py-2 pr-3">Sign</th>
                      <th className="py-2 pr-3">From natal Moon</th>
                      <th className="py-2">Aspecting natal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gochara.planets.map((p, i) => (
                      <tr key={i} className="border-t border-gold/15">
                        <td className="py-2 pr-3 capitalize">{p.name}</td>
                        <td className="py-2 pr-3">{p.sign}</td>
                        <td className="py-2 pr-3">{p.houseFromMoon}</td>
                        <td className="py-2">{p.aspects.map((x) => x.natalPlanet).join(", ") || "None"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {data.notes.map((n, i) => (
              <p key={i} className="text-sm text-mist">{n}</p>
            ))}
          </>
        )}

        {data.kind === "year-ahead" && (
          <>
            <section>
              <h2 className="font-display text-3xl text-goldbright">Monthly themes for {data.year}</h2>
              <p className="mt-1 text-sm text-mist">
                Natal Sun {data.sunSign}, natal Moon {data.moonSign}. Snapshots are 1st-of-month positions, so
                same-day Moon aspects are approximate.
              </p>
              <div className="mt-3 space-y-4">
                {data.months.map((m) => (
                  <div key={m.month} className="rounded-2xl border border-gold/25 bg-panel/70 p-4">
                    <p className="font-semibold text-cream">
                      {m.month} · transit Moon in {m.moonSign}
                    </p>
                    {m.aspects.length === 0 ? (
                      <p className="mt-1 text-sm text-mist">No transit within orb.</p>
                    ) : (
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-cream/85">
                        {m.aspects.map((a, i) => (
                          <li key={i}>
                            {a.transitPlanet} {a.aspect} natal {a.natalPlanet} (orb {a.orb}°)
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h2 className="font-display text-3xl text-goldbright">Dasha outlook</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cream/85">
                {data.dasha.periods
                  .filter((p) => p.end >= `${data.year}-01-01` && p.start <= `${data.year}-12-31`)
                  .map((p, i) => (
                    <li key={i}>
                      {p.lord}: {p.start} to {p.end}
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-sm text-mist">
                Current mahadasha {data.dasha.currentMahadasha?.lord ?? "unknown"}, antardasha{" "}
                {data.dasha.currentAntardasha?.lord ?? "unknown"}.
              </p>
            </section>
            <section>
              <h2 className="font-display text-3xl text-goldbright">Ziwei annual layer</h2>
              {data.ziwei ? (
                <p className="mt-2 text-sm text-cream/85">
                  Decade palace {data.ziwei.decade.palaceName} ({data.ziwei.decade.heavenlyStem}
                  {data.ziwei.decade.earthlyBranch}), ages {data.ziwei.decade.ageRange[0]} to{" "}
                  {data.ziwei.decade.ageRange[1]}, transformations {data.ziwei.decade.mutagen.join(", ")}.
                  Annual palace {data.ziwei.annual.palaceName} ({data.ziwei.annual.heavenlyStem}
                  {data.ziwei.annual.earthlyBranch}), transformations {data.ziwei.annual.mutagen.join(", ")}.
                </p>
              ) : (
                <p className="mt-2 text-sm text-mist">{data.ziweiWithheldReason}</p>
              )}
            </section>
          </>
        )}

        {data.kind === "comparison" && (
          <>
            <section>
              <h2 className="font-display text-3xl text-goldbright">The two charts</h2>
              <p className="mt-2 text-sm text-cream/85">
                Chart A: Sun {data.sunSignA}, Moon {data.moonSignA}. Chart B: Sun {data.sunSignB}, Moon{" "}
                {data.moonSignB}.
              </p>
            </section>
            <section>
              <h2 className="font-display text-3xl text-goldbright">Cross-aspects</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm text-cream/90">
                  <thead>
                    <tr className="text-mist">
                      <th className="py-2 pr-3">Chart A planet</th>
                      <th className="py-2 pr-3">Aspect</th>
                      <th className="py-2 pr-3">Chart B planet</th>
                      <th className="py-2">Orb</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.crossAspects.map((a, i) => (
                      <tr key={i} className="border-t border-gold/15">
                        <td className="py-2 pr-3">{a.planetA}</td>
                        <td className="py-2 pr-3">{a.aspect}</td>
                        <td className="py-2 pr-3">{a.planetB}</td>
                        <td className="py-2">{a.orb}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.crossAspects.length === 0 && (
                <p className="mt-2 text-sm text-mist">No cross-aspect within orb.</p>
              )}
            </section>
            {data.notes.map((n, i) => (
              <p key={i} className="text-sm text-mist">{n}</p>
            ))}
          </>
        )}
      </div>

      <div className="mt-12 border-t border-gold/20 pt-6">
        {deleteError && (
          <p className="mb-3 text-sm text-red-200">The report could not be deleted. Please try again.</p>
        )}
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-xl border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-200"
        >
          {confirming ? "Tap again to delete this report" : "Delete this report"}
        </button>
      </div>
    </div>
  );
}

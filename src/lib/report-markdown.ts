// Client-safe on purpose: the builder uses only the saved report data, and
// must stay free of runtime imports from ./reports (which pulls in ./charts
// and node:module) so client components can import it.
import type { SavedReport, ReportType } from "./reports";

const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  transit: "Transit report",
  "year-ahead": "Year-ahead reading",
  comparison: "Relationship comparison",
};

function mdTable(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

// Markdown export of a saved report. Content comes only from the
// report object, which holds no birth date, time, or coordinates.
export function buildReportMarkdown(report: SavedReport): string {
  const d = report.data;
  const out: string[] = [
    `# ${report.title}`,
    `${REPORT_TYPE_LABEL[report.type]}`,
    `Saved ${new Date(report.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · This report never expires.`,
    "## Interpretation",
    report.interpretation,
    `AI-generated${report.model ? ` · Written with ${report.model}` : ""}`,
  ];
  if (d.kind === "transit") {
    const p = d.gochara.panchanga;
    out.push(
      `## Western transits on ${d.targetDate}`,
      `Natal Sun ${d.sunSign}, natal Moon ${d.moonSign}, transit Moon in ${d.transits.moonSign}.`,
      mdTable(
        ["Transit planet", "Aspect", "Natal planet", "Orb", "State"],
        d.transits.aspects.map((a) => [a.transitPlanet, a.aspect, a.natalPlanet, `${a.orb}°`, a.state])
      )
    );
    if (d.transits.aspects.length === 0) out.push("No transit within orb on this date.");
    out.push(
      "## Vedic Gochara",
      `Panchanga: ${p.tithi}, ${p.nakshatra}, ${p.yoga}, ${p.vara}, ${p.karana}.`,
      mdTable(
        ["Planet", "Sign", "From natal Moon", "Aspecting natal"],
        d.gochara.planets.map((g) => [g.name, g.sign, String(g.houseFromMoon), g.aspects.map((x) => x.natalPlanet).join(", ") || "None"])
      ),
      ...d.notes
    );
  } else if (d.kind === "year-ahead") {
    out.push(
      `## Monthly themes for ${d.year}`,
      `Natal Sun ${d.sunSign}, natal Moon ${d.moonSign}. Snapshots are 1st-of-month positions, so same-day Moon aspects are approximate.`,
      d.months
        .map((m) => {
          const asp = m.aspects.length
            ? m.aspects.map((a) => `${a.transitPlanet} ${a.aspect} natal ${a.natalPlanet} (orb ${a.orb}°)`).join("; ")
            : "No transit within orb.";
          return `- ${m.month} · transit Moon in ${m.moonSign}: ${asp}`;
        })
        .join("\n"),
      "## Dasha outlook",
      d.dasha.periods
        .filter((p) => p.end >= `${d.year}-01-01` && p.start <= `${d.year}-12-31`)
        .map((p) => `- ${p.lord}: ${p.start} to ${p.end}`)
        .join("\n"),
      `Current mahadasha ${d.dasha.currentMahadasha?.lord ?? "unknown"}, antardasha ${d.dasha.currentAntardasha?.lord ?? "unknown"}.`,
      "## Ziwei annual layer",
      d.ziwei
        ? `Decade palace ${d.ziwei.decade.palaceName} (${d.ziwei.decade.heavenlyStem}${d.ziwei.decade.earthlyBranch}), ages ${d.ziwei.decade.ageRange[0]} to ${d.ziwei.decade.ageRange[1]}, transformations ${d.ziwei.decade.mutagen.join(", ")}. Annual palace ${d.ziwei.annual.palaceName} (${d.ziwei.annual.heavenlyStem}${d.ziwei.annual.earthlyBranch}), transformations ${d.ziwei.annual.mutagen.join(", ")}.`
        : d.ziweiWithheldReason ?? ""
    );
  } else {
    out.push(
      "## The two charts",
      `Chart A: Sun ${d.sunSignA}, Moon ${d.moonSignA}. Chart B: Sun ${d.sunSignB}, Moon ${d.moonSignB}.`,
      "## Cross-aspects",
      mdTable(
        ["Chart A planet", "Aspect", "Chart B planet", "Orb"],
        d.crossAspects.map((a) => [a.planetA, a.aspect, a.planetB, `${a.orb}°`])
      )
    );
    if (d.crossAspects.length === 0) out.push("No cross-aspect within orb.");
    out.push(...d.notes);
  }
  out.push("---", "For reflection, not prediction. · sortes.resonantatlas.com");
  return out.join("\n\n") + "\n";
}

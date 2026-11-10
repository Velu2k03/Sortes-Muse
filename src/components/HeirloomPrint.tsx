"use client";

/**
 * Phase 5 (5.4a): Heirloom export — a beautifully typeset keepsake
 * of a reading, chart, or report, in Cormorant Garamond + Celestial
 * Indigo, that the user can download, print, and keep.
 *
 * DECISION (documented, no new dependency): this is a dedicated
 * print stylesheet + window.print(), not a PDF library. No PDF
 * library exists in the repo today, and the candidates (jspdf,
 * pdf-lib, both MIT) would need hand-built layout code plus embedded
 * font files for Cormorant Garamond, for a worse result than the
 * browser's own typesetting of the real loaded fonts. Print-to-PDF
 * keeps real selectable text, the brand fonts already on the page,
 * zero bundle cost, and zero new-dependency risk. AF-049: the button
 * used to promise "Download keepsake (PDF)" while only opening the
 * print dialog, so it is relabelled "Print or save as PDF" and the helper
 * text says plainly to pick "Save as PDF" in the dialog.
 * The sheet contains only the caller's real content — nothing is
 * invented here.
 */
export interface HeirloomSection {
  heading: string;
  body: string;
}

export default function HeirloomPrint({
  title,
  subtitle,
  date,
  sections,
}: {
  title: string;
  subtitle?: string;
  date: string;
  sections: HeirloomSection[];
}) {
  const prettyDate = new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <>
      <button
        type="button"
        onClick={() => window.print()}
        className="btn-ghost rounded-xl px-6 py-3 font-semibold"
      >
        Print or save as PDF
      </button>
      <p className="mt-1 text-xs text-mist">
        Opens your browser&apos;s print dialog — choose &ldquo;Save as PDF&rdquo; to keep a PDF copy.
      </p>

      {/* Print-only heirloom sheet. Hidden on screen (and from
          assistive tech — the button above is the control); the
          print stylesheet in globals.css shows only this sheet. */}
      <div className="heirloom-print-sheet" aria-hidden="true">
        <p className="heirloom-brand">SORTES</p>
        <h1 className="heirloom-title">{title}</h1>
        {subtitle && <p className="heirloom-subtitle">{subtitle}</p>}
        <p className="heirloom-date">{Number.isNaN(Date.parse(date)) ? date : prettyDate}</p>
        <hr className="heirloom-rule" />
        {sections
          .filter((s) => s.body.trim() !== "")
          .map((s) => (
            <section key={s.heading} className="heirloom-section">
              <h2 className="heirloom-heading">{s.heading}</h2>
              <p className="heirloom-body">{s.body}</p>
            </section>
          ))}
        <hr className="heirloom-rule" />
        <p className="heirloom-footer">
          For reflection, not prediction. · sortes.resonantatlas.com
        </p>
      </div>
    </>
  );
}

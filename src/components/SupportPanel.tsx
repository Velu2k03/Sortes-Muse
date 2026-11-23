import clsx from "clsx";
import { supportPanel, type SupportPanel as SupportPanelData, type SupportTier } from "@/lib/safety";

/**
 * Batch 1 (S1): the calm support panel. Tier A shows it INSTEAD of a
 * reading (nothing generated, nothing spent); Tier B shows it ABOVE
 * the reading. The copy comes from src/lib/safety.ts (the server sends
 * the same fields), so the client and the server never drift.
 */
export default function SupportPanel({
  panel,
  tier,
}: {
  panel?: SupportPanelData | null;
  tier?: SupportTier;
}) {
  const p = panel ?? (tier ? supportPanel(tier) : null);
  if (!p) return null;
  return (
    <section
      role="note"
      aria-label="Support"
      className="mx-auto mt-6 w-full max-w-3xl rounded-3xl border border-gold/40 bg-panel/80 p-6 text-left sm:p-8"
    >
      <h2 className="font-display text-2xl text-cream">{p.title}</h2>
      <p className="mt-3 leading-relaxed text-cream/90">{p.message}</p>
      {p.prompt && <p className="mt-3 leading-relaxed text-cream/90">{p.prompt}</p>}
      <p className="mt-4">
        <a
          href={p.helplineUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-goldbright underline underline-offset-4"
        >
          {p.helplineLabel}
        </a>
      </p>
      <p className="mt-3 text-sm text-cream/80">{p.emergencyLine}</p>
      {p.noCreditsLine && <p className="mt-3 text-sm text-mist">{p.noCreditsLine}</p>}
    </section>
  );
}

/** S1: the persistent non-advisory line shown wherever a reading is shown. */
export const READING_DISCLAIMER =
  "Readings are for reflection and entertainment only. They are not medical, financial, legal, or other professional advice.";

export function ReadingDisclaimer({ className }: { className?: string }) {
  return <p className={clsx("text-xs leading-relaxed text-mist", className)}>{READING_DISCLAIMER}</p>;
}

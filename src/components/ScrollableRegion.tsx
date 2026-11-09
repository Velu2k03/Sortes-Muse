import type { ReactNode } from "react";

// A labelled, horizontally scrollable wrapper for wide tables.
// tabIndex={0} is deliberate: a scrollable region must be focusable so
// keyboard users can scroll it with the arrow keys (W3C WAI-ARIA
// practices; axe rule scrollable-region-focusable). A <section> with an
// aria-label is exposed as a named region, so no explicit role is needed.
export default function ScrollableRegion({
  label,
  className = "mt-3 overflow-x-auto",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section tabIndex={0} aria-label={label} className={className}>
      {children}
    </section>
  );
}

import type { ReactNode } from "react";

// A labelled group of related controls (e.g. a row of toggle buttons).
// Renders a native <fieldset> instead of <div role="group">. The base
// classes only neutralise UA fieldset styles (margin, border, padding,
// min-inline-size:min-content), so layout comes from className alone.
// aria-label is required because there is no visible <legend>.
export default function FieldGroup({
  "aria-label": ariaLabel,
  className = "",
  children,
}: {
  "aria-label": string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset aria-label={ariaLabel} className={`m-0 min-w-0 border-0 p-0 ${className}`}>
      {children}
    </fieldset>
  );
}

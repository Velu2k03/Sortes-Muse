import type { ReactNode } from "react";

/**
 * Page hero: gold label + display H1 (+ optional subtitle). Output is
 * identical to the block previously copied across content pages.
 * titleClassName appends responsive extras such as "sm:text-6xl".
 * The eyebrow is optional: where the H1 already says it (About above
 * About Sortes), the page omits it instead of repeating the word.
 * UX audit Phase 2, F14: the label is sentence case, untracked, one
 * step smaller than body text — never tracked small caps.
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  titleClassName,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <>
      {eyebrow ? <p className="text-sm text-gold">{eyebrow}</p> : null}
      <h1 className={`mt-3 font-display text-5xl text-goldbright${titleClassName ? ` ${titleClassName}` : ""}`}>
        {title}
      </h1>
      {subtitle ? <p className="mx-auto mt-4 max-w-xl text-cream/75">{subtitle}</p> : null}
    </>
  );
}

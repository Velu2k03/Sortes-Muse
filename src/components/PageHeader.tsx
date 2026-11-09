import type { ReactNode } from "react";

/**
 * Page hero: gold eyebrow + display H1 (+ optional subtitle). Output is
 * identical to the block previously copied across content pages.
 * titleClassName appends responsive extras such as "sm:text-6xl".
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  titleClassName,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.35em] text-gold">{eyebrow}</p>
      <h1 className={`mt-3 font-display text-5xl text-goldbright${titleClassName ? ` ${titleClassName}` : ""}`}>
        {title}
      </h1>
      {subtitle ? <p className="mx-auto mt-4 max-w-xl text-cream/75">{subtitle}</p> : null}
    </>
  );
}

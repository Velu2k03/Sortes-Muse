import Link from "next/link";

// Phase F: a plain breadcrumb row for deep pages (reading detail,
// intake flow, spread flow), so a first-time user always sees which
// section they are in and how to step back. No animation, no new
// dependency: just links.
export default function Breadcrumbs({
  trail,
}: {
  trail: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-mist">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true">/</span>
              )}
              {last || !crumb.href ? (
                <span aria-current="page" className="text-cream">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="hover:text-goldbright">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

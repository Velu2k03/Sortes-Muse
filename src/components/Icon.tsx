// Minor and basic icons for Sortes, one consistent set.
// Licence: Tabler Icons, MIT, 24x24 grid, 2px stroke, round caps and
// joins (tabler.io/icons, "Free and open source", MIT License on its
// site). Two Iconoir paths are also MIT (Iconoir by Luca Burgio, MIT,
// 24x24 grid, 1.5 stroke, paths verified from the Iconoir pages on
// shadcn.io in Nov 2026: sun-light and open-book). Coolicons original
// set is CC BY 4.0 per its shadcn listing, so no Coolicons path is
// copied here. The whole set stays MIT and needs no per-icon
// attribution line in the UI. Iconoir icons keep their own 1.5 stroke
// within the group, so the group is internally consistent.
// No brand logo is used as an icon. No emoji is used as an icon.
// Stroke width and size are fixed by this component: Tabler stroke 2,
// Iconoir stroke 1.5, size 20 by default, currentColor, so icons match
// within each group in header, nav, spreads,
// charts, horoscope, history, credits, and buttons in both themes.
export type IconName =
  | "home"
  | "deck"
  | "sun"
  | "moon"
  | "sparkle"
  | "coin"
  | "chart"
  | "star"
  | "journal"
  | "menu"
  | "close"
  | "chevronRight"
  | "chevronLeft"
  | "arrowRight"
  | "search"
  | "share"
  | "download"
  | "calendar"
  | "heart"
  | "briefcase"
  | "check"
  | "info"
  | "globe"
  | "clock"
  | "lock"
  | "user"
  | "iconoirSun"
  | "iconoirBook";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  deck: (
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="M2 12l10 5 10-5" />
      <path d="M2 17l10 5 10-5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M15 9.5c0-1-1.3-1.5-3-1.5s-3 .5-3 1.5c0 2 6 1 6 3 0 1-1.3 1.5-3 1.5s-3-.5-3-1.5" />
    </>
  ),
  chart: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </>
  ),
  star: <path d="M12 3l2.5 5.5 6 .5-4.5 4 1.2 6L12 16l-5.2 3 1.2-6L3.5 9l6-.5Z" />,
  journal: (
    <>
      <path d="M12 5c-2-1.5-5-2-8-2v16c3 0 6 .5 8 2 2-1.5 5-2 8-2V3c-3 0-6 .5-8 2Z" />
      <path d="M12 5v16" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  share: (
    <>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  heart: <path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9Z" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  check: <path d="M5 12l4 4 10-10" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7h.01" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
    </>
  ),
  // Iconoir (MIT), 1.5 stroke: sun-light, open-book. Paths copied
  // verbatim from the Iconoir listings, not redrawn in Tabler style.
  iconoirSun: (
    <path d="M12 18a6 6 0 1 0 0-12a6 6 0 0 0 0 12m10-6h1M12 2V1m0 22v-1m8-2l-1-1m1-15l-1 1M4 20l1-1M4 4l1 1m-4 7h1" />
  ),
  iconoirBook: (
    <g strokeWidth="1.5">
      <path d="M12 21V7a2 2 0 0 1 2-2h7.4a.6.6 0 0 1 .6.6v13.114M12 21V7a2 2 0 0 1-2-2H2.6a.6.6 0 0 0-.6.6v13.114M14 19h8m-12 0H2" />
      <path strokeLinejoin="round" d="M12 21a2 2 0 0 1 2-2m-2 2a2 2 0 0 0-2-2" />
    </g>
  ),
};

const STROKES: Partial<Record<IconName, string>> = {
  iconoirSun: "1.5",
  iconoirBook: "1.5",
};

export default function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKES[name] ?? "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

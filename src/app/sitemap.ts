import type { MetadataRoute } from "next";
import { statSync } from "node:fs";
import { join } from "node:path";
import { SITE_URL } from "@/lib/site";
import { CARDS, cardSlug } from "@/lib/cards";

// New audit tool finding: /sitemap.xml returned 404, so search
// engines had no page list to discover. Only canonical pages are
// listed: redirect pages (/card-meanings, /readings, /history),
// the account page, and the offline fallback are left out.
// Phase 1 verification, 2026-11-04: this list was checked against
// src/app routes and against the live sitemap.xml, and it matches:
// 27 canonical pages, all 6 spread slugs, all 5 guide slugs, no
// dead chart subpaths, no daily-card, no three-card, no relationship.
// Dead typed URLs are handled by redirects in next.config.ts, not
// by adding non-canonical pages to this list. Intake and reading
// detail pages are flows, not canonical content, so they stay out.
// Phase 3 (3.3): /history and /credits redirect permanently to /journal
// and /oracles. /journal stays OUT of the sitemap because
// src/app/journal/page.tsx sets robots index:false (AF-072); /oracles
// stays listed.
// Phase 4A (4.4): all 78 /deck/[slug] card pages are canonical too,
// generated from the same slug helper as the routes themselves.
const PAGES = [
  "/",
  "/daily",
  "/deck",
  "/charts",
  "/reports",
  "/horoscope",
  "/spreads",
  "/spreads/quick-insight",
  "/spreads/past-present-future",
  "/spreads/love-insight",
  "/spreads/career-path",
  "/spreads/weekly-outlook",
  "/spreads/celtic-cross",
  "/oracles",
  "/methodology",
  "/about",
  "/contact",
  "/faq",
  "/birth-card",
  "/guides",
  "/guides/what-is-tarot",
  "/guides/how-to-ask-a-tarot-question",
  "/guides/celtic-cross-explained",
  "/guides/tarot-and-birth-charts",
  "/guides/topic-spreads-love-career-week",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    ...PAGES,
    ...CARDS.map((c) => `/deck/${cardSlug(c.name)}`),
  ];
  return pages.map((path) => ({
    url: `${SITE_URL}${path}`,
    // AF-070: a real per-page lastmod, from the source file's mtime,
    // instead of one identical build stamp on all 105 entries.
    lastModified: lastModifiedFor(path),
    changeFrequency: path === "/" || path === "/daily" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path === "/deck" || path === "/charts" ? 0.9 : path.startsWith("/deck/") ? 0.7 : 0.8,
  }));
}

// Each canonical path maps to the file that renders it; card pages
// share the [slug] page. Unmapped paths fall back to now.
function lastModifiedFor(path: string): Date {
  const file =
    path === "/"
      ? "src/app/page.tsx"
      : path.startsWith("/deck/")
        ? "src/app/deck/[slug]/page.tsx"
        : path.startsWith("/spreads/")
          ? "src/app/spreads/[slug]/page.tsx"
          : path.startsWith("/guides/")
            ? "src/app/guides/[slug]/page.tsx"
            : `src/app${path}/page.tsx`;
  try {
    return statSync(join(process.cwd(), file)).mtime;
  } catch {
    try {
      // Layout-routed pages (daily, deck index, horoscope, birth-card).
      return statSync(join(process.cwd(), `src/app${path}/layout.tsx`)).mtime;
    } catch {
      return new Date();
    }
  }
}

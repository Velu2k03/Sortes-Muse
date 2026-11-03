import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// New audit tool finding: /sitemap.xml returned 404, so search
// engines had no page list to discover. Only canonical pages are
// listed: redirect pages (/card-meanings, /readings, /journal),
// the account page, and the offline fallback are left out.
// Phase 1 verification, 2026-11-04: this list was checked against
// src/app routes and against the live sitemap.xml, and it matches:
// 27 canonical pages, all 6 spread slugs, all 5 guide slugs, no
// dead chart subpaths, no daily-card, no three-card, no relationship.
// Dead typed URLs are handled by redirects in next.config.ts, not
// by adding non-canonical pages to this list. Intake and reading
// detail pages are flows, not canonical content, so they stay out.
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
  "/history",
  "/credits",
  "/methodology",
  "/about",
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
  const now = new Date();
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" || path === "/daily" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path === "/deck" || path === "/charts" ? 0.9 : 0.8,
  }));
}

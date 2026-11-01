import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// New audit tool finding: /sitemap.xml returned 404, so search
// engines had no page list to discover. Only canonical pages are
// listed: redirect pages (/card-meanings, /readings, /journal),
// the account page, and the offline fallback are left out.
const PAGES = [
  "/",
  "/daily",
  "/deck",
  "/charts",
  "/horoscope",
  "/spreads",
  "/spreads/quick-insight",
  "/spreads/past-present-future",
  "/spreads/celtic-cross",
  "/history",
  "/credits",
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

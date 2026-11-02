import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// New audit tool finding: /robots.txt returned 404, so search
// engines had no crawl guidance at all. This file makes Next.js
// serve a real robots.txt at the root.
export default function robots(): MetadataRoute.Robots {
  // Explicit AI crawler rules, same access as the general rule:
  // allow everything except the API. Listing them by name helps
  // AI readiness checkers that look for named bot directives.
  const aiBots = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"];
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      ...aiBots.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: "/api/",
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

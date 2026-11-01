import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// New audit tool finding: /robots.txt returned 404, so search
// engines had no crawl guidance at all. This file makes Next.js
// serve a real robots.txt at the root.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

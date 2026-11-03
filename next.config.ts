import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1, 2026-11-04: redirects for typed and legacy URLs that
  // otherwise render the site not-found page. These slugs were found
  // in the all-pages crawl as dead: daily-card, chart system subpaths
  // (charts are a selector on /charts, not subpages), three-card and
  // relationship spread slugs, and two old guide slugs. Renamed
  // content slugs redirect permanently; /intake is a missing flow
  // entry, not a moved page, so it redirects temporarily to /spreads.
  async redirects() {
    return [
      { source: "/daily-card", destination: "/daily", permanent: true },
      { source: "/charts/western", destination: "/charts", permanent: true },
      { source: "/charts/vedic", destination: "/charts", permanent: true },
      { source: "/charts/ziwei", destination: "/charts", permanent: true },
      { source: "/spreads/three-card", destination: "/spreads/past-present-future", permanent: true },
      { source: "/spreads/relationship", destination: "/spreads/love-insight", permanent: true },
      { source: "/guides/how-tarot-works", destination: "/guides/what-is-tarot", permanent: true },
      { source: "/guides/how-to-read-a-spread", destination: "/guides/celtic-cross-explained", permanent: true },
      { source: "/intake", destination: "/spreads", permanent: false },
    ];
  },
  // Security headers audit: Vercel only sent HSTS. These are safe,
  // no content-security-policy here, because a strict CSP could
  // break Lemon Squeezy checkout and the AI routes, and that
  // needs its own tested change, not a header added blind.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

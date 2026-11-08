import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AF-039 (audit-fixes W3): cap next/image widths. Card slots are
  // 160-280px and the hero is full-bleed, so nothing ever needs the
  // 1920/2048/3840 rungs Next ships by default (a 3840w card request
  // was 108,852 B vs 20,648 B at 640w). Largest rung is 1200w.
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
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
      // Phase 3 (3.3): /credits → /oracles, /history → /journal.
      // The labels were already Oracles and Journal; the routes now
      // match. Old URLs redirect permanently, never 404.
      { source: "/credits", destination: "/oracles", permanent: true },
      { source: "/history", destination: "/journal", permanent: true },
      // AF-073/AF-084 (audit-fixes W3): dead typed URLs found 404 in
      // the audits. Permanent (308) redirects to the canonical route.
      // /contact is NOT redirected: AF-079 adds a real /contact page.
      { source: "/pricing", destination: "/oracles", permanent: true },
      { source: "/login", destination: "/account", permanent: true },
      { source: "/signin", destination: "/account", permanent: true },
      { source: "/sign-in", destination: "/account", permanent: true },
      { source: "/signup", destination: "/account", permanent: true },
      { source: "/card-meanings", destination: "/deck", permanent: true },
      { source: "/readings", destination: "/journal", permanent: true },
      { source: "/reading", destination: "/journal", permanent: true },
      { source: "/shop", destination: "/oracles", permanent: true },
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
  // CSP moved to src/proxy.ts (Round 3, 2026-11-08): it is now a
  // per-request nonce CSP minted in Proxy, with no script-src
  // 'unsafe-inline'. It must NOT also be set here: browsers enforce
  // every CSP header they receive, so a static one would still block
  // (or still allow) whatever the nonce policy does not.
  // HSTS (AF-006, 2026-11-08): Vercel's automatic HSTS
  // (max-age=63072000, no includeSubDomains) is NOT applied once
  // next.config declares headers, so this app previously shipped no
  // HSTS at all on the custom domain. It is set here explicitly
  // with includeSubDomains. No `preload`: preloading is a
  // near-irreversible browser-list commitment and needs Velu's
  // explicit go-ahead. includeSubDomains assumes every
  // *.resonantatlas.com subdomain serves HTTPS (true for anything
  // Vercel-hosted, which auto-provisions certs).
  async headers() {
    return [
      // AF-092 (audit-fixes W3): static images are content-hashed by
      // Next, so they can be immutable for a year instead of
      // max-age=0, must-revalidate.
      {
        source: "/cards/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/packs/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // AF-095: isolate the browsing context from cross-origin openers.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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

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
      // Phase 3 (3.3): /credits → /oracles, /history → /journal.
      // The labels were already Oracles and Journal; the routes now
      // match. Old URLs redirect permanently, never 404.
      { source: "/credits", destination: "/oracles", permanent: true },
      { source: "/history", destination: "/journal", permanent: true },
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
  // Security headers audit (Phase 1, 2026-11-05): CSP added and
  // smoke-tested with `npm run build` + `npm run start` + curl on /
  // and /credits. Lemon Squeezy checkout is a full-page redirect
  // (window.location.href), not an iframe or script, so frame-src
  // 'none' does not block it; Supabase auth runs from the browser
  // client, so connect-src allows *.supabase.co. Deliberately left
  // out: script-src 'unsafe-inline' is KEPT because Next.js needs
  // it for its inline bootstrap scripts (a nonce-based CSP would
  // need middleware to mint per-request nonces — a follow-up, not
  // this phase); no 'unsafe-eval'; no third-party script origins
  // beyond Plausible; frame-ancestors 'none' matches the
  // X-Frame-Options: DENY below.
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
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://plausible.io",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://plausible.io",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
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

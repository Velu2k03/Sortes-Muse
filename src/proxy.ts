import { NextResponse, type NextRequest } from "next/server";

// AF-006 follow-up (Round 3, 2026-11-08): per-request nonce CSP.
// Replaces the static CSP that lived in next.config.ts headers()
// (two CSP headers are BOTH enforced, so that one is removed).
// Pattern from node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md ("Adding a nonce with Proxy"). Next 16
// renamed middleware.ts to proxy.ts (file-conventions/middleware.md).
//
// Next reads the nonce out of the request's CSP header (script-src,
// see next/dist/server/app-render/get-script-nonce-from-header.js)
// and stamps it on its own bootstrap/inline scripts. The root layout
// reads x-nonce for its two hand-written inline scripts.
//
// script-src: no 'unsafe-inline'. 'strict-dynamic' lets chunks loaded
// by nonced Next scripts run. https://plausible.io stays as the CSP2
// fallback for the optional Plausible tag (layout.tsx, env-gated).
//
// style-src keeps 'unsafe-inline' and NO nonce: when a nonce is
// present browsers ignore 'unsafe-inline', and a nonce cannot cover
// style="" attributes. React style={...} props (31 files in src/)
// and framer-motion initial styles render as style attributes, so a
// nonce-only style-src would block them. The CSP guide lists inline
// styles under "Common CSP Violations" for this reason.
//
// Unchanged from the old static policy: frame-src 'none' (Lemon
// Squeezy checkout is a full-page redirect, not an iframe) and
// connect-src *.supabase.co (browser-side Supabase auth).
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://plausible.io${isDev ? " 'unsafe-eval'" : ""}`,
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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only. Skips API routes, Next static/image assets, the PWA
    // service worker and manifest, and any public file with an
    // extension (cards, icons, brand, packs, robots.txt, llms.txt...).
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.[a-zA-Z0-9]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

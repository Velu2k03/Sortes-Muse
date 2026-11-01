import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

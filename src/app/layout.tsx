import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Starfield from "@/components/Starfield";
import InstallBanner from "@/components/InstallBanner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { AuthProvider } from "@/components/AuthProvider";
import MotionProvider from "@/components/MotionProvider";
import { PageTransition } from "@/components/ReactBitsNew";
import { APP_NAME, APP_SHORT, TAGLINE, SITE_URL, CONTACT_EMAIL } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${APP_NAME} | ${TAGLINE}`,
    template: `%s | ${APP_SHORT}`,
  },
  // AF-071: 140-160 characters. AF-081: the obsolete keywords meta
  // tag is deleted (search engines ignore it; it only leaks terms).
  description:
    "Free tarot reading online, with AI interpretation. Draw a free daily card, explore 78 card meanings, and get a reading for your question. First reading free.",
  applicationName: APP_SHORT,
  alternates: { canonical: SITE_URL },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_SHORT,
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: APP_NAME,
    title: "Free tarot reading online, with AI interpretation",
    description:
      "Free tarot reading online, with AI interpretation. Draw a free daily card, explore 78 card meanings, and get a reading for your question. First reading free.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: APP_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free tarot reading online, with AI interpretation",
    description:
      "Free tarot reading online, with AI interpretation. Draw a free daily card, explore 78 card meanings, and get a reading for your question. First reading free.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.webp", sizes: "192x192", type: "image/webp" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-request CSP nonce minted in src/proxy.ts. Reading headers()
  // makes every page dynamically rendered, which the nonce needs.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-body">
        {/* Theme before paint: a saved choice (localStorage
            sortes-theme) wins; with no saved choice the OS
            prefers-color-scheme decides (AF-031). Runs before React
            hydration so the first paint is already the right theme,
            not a light flash.
            AF-093: the old <Script src="/theme.js"
            beforeInteractive> only preloaded theme.js — the served
            HTML had the preload link but no script tag, so the theme
            was not applied before paint. The 315 bytes are inlined
            here instead, and public/theme.js is deleted. It carries
            the per-request CSP nonce (src/proxy.ts). */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('sortes-theme');var theme=(t==='light'||t==='dark')?t:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=theme;var m=document.querySelector('meta[name=\"theme-color\"]');if(m)m.setAttribute('content',theme==='dark'?'#0a0e1a':'#fdf9ee');}catch{document.documentElement.dataset.theme='dark';}",
          }}
        />
        {/* Lightsite fix V12: Organization and WebSite JSON-LD, so
            search and AI tools know who runs Sortes. Static constants
            only, no user input, no social links invented. */}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  name: APP_NAME,
                  url: SITE_URL,
                  email: CONTACT_EMAIL,
                },
                { "@type": "WebSite", name: APP_NAME, url: SITE_URL },
              ],
            }),
          }}
        />
        {/* Phase 3: skip link, first in tab order, visible on focus. */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-gold focus:px-4 focus:py-2 focus:font-bold focus:text-ink">
          Skip to main content
        </a>
        <MotionProvider>
        <AuthProvider>
          <ServiceWorkerRegister />
          <Starfield />
          <Header />
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none"><PageTransition>{children}</PageTransition></main>
          <Footer />
          <InstallBanner />
          {/* Phase 3: PushPrompt deleted (3.1) — it only asked for
              Notification permission and no real Web Push exists, so
              the prompt promised reminders that could never arrive. */}
        </AuthProvider>
        </MotionProvider>
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
            nonce={nonce}
          />
        )}
      </body>
    </html>
  );
}

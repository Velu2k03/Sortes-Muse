import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Starfield from "@/components/Starfield";
import InstallBanner from "@/components/InstallBanner";
import PushPrompt from "@/components/PushPrompt";
import { APP_NAME, APP_SHORT, TAGLINE, SITE_URL } from "@/lib/site";

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
  description:
    "Sortes is a modern tarot reading app by Resonant Atlas. Draw your free daily card, explore all 78 card meanings, and receive personalized AI readings. Cast the lots. Read your story.",
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
    title: APP_NAME,
    description: TAGLINE,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: APP_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: TAGLINE,
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.webp", sizes: "192x192", type: "image/webp" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },
  keywords: [
    "tarot",
    "tarot reading",
    "daily tarot card",
    "tarot card meanings",
    "celtic cross",
    "AI tarot",
    "Sortes",
  ],
};

export const viewport: Viewport = {
  themeColor: "#0a0e1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-body">
        <Starfield />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <InstallBanner />
        <PushPrompt />
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

// AF-070: one place for per-page Open Graph / Twitter metadata, so
// every indexable page gets its own title, description, and image
// instead of inheriting the layout's identical OG block. Descriptions
// passed in here should be 140-160 characters (AF-071).
export function pageSocial({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const url = `${SITE_URL}${path}`;
  const img = image ?? "/og-image.jpg";
  return {
    openGraph: {
      type: "website",
      url,
      title,
      description,
      images: [{ url: img, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [img],
    },
  };
}

// AF-070: BreadcrumbList JSON-LD. Pass the trail as [name, path]
// pairs; the home crumb is always first.
export function breadcrumbJsonLd(trail: [string, string][]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${SITE_URL}${path}`,
    })),
  };
}

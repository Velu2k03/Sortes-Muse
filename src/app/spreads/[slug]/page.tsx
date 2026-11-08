import { notFound } from "next/navigation";
import ReadingFlow from "@/components/ReadingFlow";
import { SPREADS, getSpread } from "@/lib/tarot";
import { breadcrumbJsonLd, pageSocial } from "@/lib/seo";

export function generateStaticParams() {
  return SPREADS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const s = getSpread(slug);
    // AF-070: per-spread OG/Twitter + BreadcrumbList (added in the
    // page component below).
    return {
      title: `${s.name} Tarot Reading`,
      description: s.description,
      alternates: { canonical: `/spreads/${slug}` },
      ...pageSocial({
        title: `${s.name} Tarot Reading`,
        description: s.description,
        path: `/spreads/${slug}`,
      }),
    };
  } catch {
    return { title: "Reading" };
  }
}

export default async function SpreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SPREADS.some((s) => s.slug === slug)) notFound();
  const spread = getSpread(slug);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              ["Home", "/"],
              ["Spreads", "/spreads"],
              [spread.name, `/spreads/${slug}`],
            ]),
          ),
        }}
      />
      <ReadingFlow slug={slug} />
    </>
  );
}

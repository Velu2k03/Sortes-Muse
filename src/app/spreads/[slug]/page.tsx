import { notFound } from "next/navigation";
import ReadingFlow from "@/components/ReadingFlow";
import { SPREADS, getSpread } from "@/lib/tarot";

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
    return {
      title: `${s.name} Tarot Reading`,
      description: s.description,
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
  return <ReadingFlow slug={slug} />;
}

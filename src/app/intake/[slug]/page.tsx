import { notFound } from "next/navigation";
import IntakeFlow from "./IntakeFlow";
import { SPREADS } from "@/lib/tarot";
import { pageSocial } from "@/lib/seo";

export function generateStaticParams() {
  return SPREADS.map((s) => ({ slug: s.slug }));
}

const DESCRIPTION =
  "Tell your story so your reading can be written for your question. Your story goes to the AI for this reading only.";

// Batch 4d: this page inherited the generic homepage OG block. It
// gets its own OG/Twitter now, with the real intake URL.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: "Personalize your reading",
    description: DESCRIPTION,
    robots: { index: false, follow: true },
    ...pageSocial({
      title: "Personalize your reading",
      description: DESCRIPTION,
      path: `/intake/${slug}`,
    }),
  };
}

export default async function IntakePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SPREADS.some((s) => s.slug === slug)) notFound();
  return <IntakeFlow slug={slug} />;
}

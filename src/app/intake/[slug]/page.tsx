import { notFound } from "next/navigation";
import IntakeFlow from "./IntakeFlow";
import { SPREADS } from "@/lib/tarot";

export function generateStaticParams() {
  return SPREADS.map((s) => ({ slug: s.slug }));
}

export const metadata = {
  title: "Personalize your reading",
  description:
    "Tell your story so your tarot reading can be woven around it. Only your first name is ever shared with the AI.",
};

export default async function IntakePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SPREADS.some((s) => s.slug === slug)) notFound();
  return <IntakeFlow slug={slug} />;
}

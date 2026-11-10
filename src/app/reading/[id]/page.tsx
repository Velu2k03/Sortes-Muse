import { pageSocial } from "@/lib/seo";
import ReadingDetail from "./ReadingDetailClient";

const DESCRIPTION =
  "Your saved tarot reading: the cards you drew, your question, and the full AI interpretation. Revisit it any time from your journal.";

// Batch 4d: this page inherited the generic homepage OG block. It
// gets its own OG/Twitter now, with the real reading URL.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: "Reading",
    description: DESCRIPTION,
    robots: { index: false, follow: true },
    ...pageSocial({
      title: "Reading",
      description: DESCRIPTION,
      path: `/reading/${id}`,
    }),
  };
}

export default async function ReadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReadingDetail id={id} />;
}

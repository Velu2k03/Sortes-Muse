import ReadingDetail from "./ReadingDetailClient";

export const metadata = {
  title: "Reading",
  description: "Your saved tarot reading.",
  robots: { index: false, follow: true },
};

export default async function ReadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReadingDetail id={id} />;
}

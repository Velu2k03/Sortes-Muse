import { resolveDeckFilter } from "@/lib/cards";
import DeckClient from "./DeckClient";

export default async function DeckPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  return (
    <DeckClient initialFilter={resolveDeckFilter(sp.filter)} initialQuery={q ?? ""} />
  );
}

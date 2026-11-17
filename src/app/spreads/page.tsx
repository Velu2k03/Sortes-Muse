import SpreadsClient from "./SpreadsClient";
import { SPREADS } from "@/lib/tarot";
import { pageSocial } from "@/lib/seo";

export const metadata = {
  title: "Tarot Readings",
  description:
    "Choose your tarot spread: Quick Insight, topic spreads, or the Celtic Cross. Your first Quick Insight reading is free, no payment card needed.",
  alternates: { canonical: "/spreads" },
  ...pageSocial({ title: "Tarot Readings", description: "Choose your tarot spread: Quick Insight, topic spreads, or the Celtic Cross. Your first Quick Insight reading is free, no payment card needed.", path: "/spreads" }),
};

export default async function SpreadsPage({
  searchParams,
}: {
  searchParams: Promise<{ spread?: string | string[] }>;
}) {
  // URL state sync (all-pages fix 4): ?spread=<slug> highlights
  // that spread's card, so a shared link opens on the spread the
  // asker picked. Only a real spread slug counts; anything else
  // is no selection, the same as loading /spreads bare. Reading
  // searchParams makes this route dynamic, the same pattern /deck
  // and /horoscope already use.
  const sp = await searchParams;
  const raw = Array.isArray(sp.spread) ? sp.spread[0] : sp.spread;
  const initialPickedSlug =
    raw && SPREADS.some((s) => s.slug === raw) ? raw : null;
  return <SpreadsClient initialPickedSlug={initialPickedSlug} />;
}

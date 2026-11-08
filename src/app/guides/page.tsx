import Link from "next/link";
import { pageSocial } from "@/lib/seo";
import { GUIDES } from "@/lib/guides";
import GuidesSearch from "@/components/GuidesSearch";

export const metadata = {
  title: "Guides",
  description:
    "Short, substantive guides to tarot, spreads, and birth charts, written for Sortes. Learn how spreads work, how to ask, and what charts can say.",
  alternates: { canonical: "/guides" },
  ...pageSocial({ title: "Guides", description: "Short, substantive guides to tarot, spreads, and birth charts, written for Sortes. Learn how spreads work, how to ask, and what charts can say.", path: "/guides" }),
};

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Guides</p>
      <h1 className="mt-3 font-display text-5xl text-goldbright">
        Guides to tarot and charts
      </h1>
      <p className="mt-4 max-w-xl text-cream/75">
        Free, no account needed.
      </p>
      <div className="mt-10">
        {/* AF-083: search stays hidden until there are >9 guides (5 now). */}
        <GuidesSearch guides={GUIDES} showSearch={GUIDES.length > 9} />
      </div>
      <p className="mt-10 text-sm text-mist">
        Or try it instead:
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/daily" className="btn-gold">
          Daily Card
        </Link>
        <Link href="/deck" className="btn-secondary">
          Browse the deck
        </Link>
      </div>
    </div>
  );
}

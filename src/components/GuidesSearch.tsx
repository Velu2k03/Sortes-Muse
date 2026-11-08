"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Guide } from "@/lib/guides";
import { AnimatedList } from "@/components/ReactBitsNew";

export default function GuidesSearch({
  guides,
  showSearch = true,
}: {
  guides: Guide[];
  showSearch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.sections.some((s) => s.heading.toLowerCase().includes(q))
    );
  }, [query, guides]);

  return (
    <div>
      {showSearch && (
        <>
          <label htmlFor="guides-search" className="mb-1.5 block text-sm font-medium text-cream">
            Search guides
          </label>
          <input
            id="guides-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides, e.g. celtic, love, charts…"
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
          />
        </>
      )}
      <AnimatedList className="mt-10 space-y-4">
        {list.map((g) => (
          <Link
            key={g.slug}
            href={`/guides/${g.slug}`}
            className="block rounded-3xl border border-gold/25 bg-panel/70 p-6 hover:border-gold/60"
          >
            <h2 className="font-display text-3xl text-balance text-goldbright">{g.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-cream/75">{g.description}</p>
            <span className="mt-3 inline-block text-sm font-semibold text-goldbright underline underline-offset-4">
              Read the guide<span className="sr-only">: {g.title}</span>
            </span>
          </Link>
        ))}
      </AnimatedList>
      {list.length === 0 && (
        <p className="mt-10 text-cream/75">No guides match that search. Try a shorter word.</p>
      )}
    </div>
  );
}

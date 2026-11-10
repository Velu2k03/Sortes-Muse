"use client";

import { useEffect, useRef } from "react";

export type FaqItem = { q: string; a: string; bullets?: string[]; group: string };

/**
 * Batch 6c: the 16 questions are grouped under four section
 * headings, in this order. The order is fixed here (not the
 * array order), so a question's group is decided by its `group`
 * field in src/app/faq/page.tsx and the sections always render
 * in the same order. Any group not listed here (none today)
 * renders after these, in array order.
 */
const GROUP_ORDER = [
  "Pricing and Oracles",
  "Readings and Charts",
  "Privacy and Data",
  "Account",
];

function slug(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Personal Phase 4, Decision 16: FAQ expand all, collapse all, and
 * anchor links. Native details stay keyboard accessible; the
 * buttons only toggle the open attribute, they do not replace
 * any answer text. A hash link opens its answer on load.
 */
export default function FaqList({ faqs }: { faqs: FaqItem[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Open the answer a hash points at, on load and on in-page jump-nav clicks.
    const openHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;
      const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(hash)}`);
      if (el && el.tagName === "DETAILS") {
        (el as HTMLDetailsElement).open = true;
        el.scrollIntoView();
      }
    };
    openHash();
    window.addEventListener("hashchange", openHash);
    return () => window.removeEventListener("hashchange", openHash);
  }, []);

  const setAll = (open: boolean) => {
    listRef.current
      ?.querySelectorAll("details")
      .forEach((d) => {
        d.open = open;
      });
  };

  // Batch 6c: group the questions under their section headings.
  // The details ids (slug of the question) do not change, so
  // existing anchors (e.g. /faq#what-are-the-five-oracle-rules
  // from /spreads) still work.
  const grouped = [
    ...GROUP_ORDER.map((name) => ({
      name,
      items: faqs.filter((f) => f.group === name),
    })),
    ...[...new Set(faqs.map((f) => f.group))]
      .filter((name) => !GROUP_ORDER.includes(name))
      .map((name) => ({ name, items: faqs.filter((f) => f.group === name) })),
  ].filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setAll(true)}
          className="btn-gold rounded-xl px-5 py-2.5 text-sm font-bold"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="btn-ghost rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Collapse all
        </button>
      </div>
      <nav aria-label="Questions" className="mt-6 rounded-3xl border border-gold/20 bg-panel/60 p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          Jump to a question
        </p>
        {grouped.map((g) => (
          <div key={g.name} className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">
              {g.name}
            </p>
            <ul className="mt-2 space-y-1.5">
              {g.items.map((f) => (
                <li key={f.q}>
                  <a
                    href={`#${slug(f.q)}`}
                    className="text-sm font-semibold text-goldbright underline underline-offset-4"
                  >
                    {f.q}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div ref={listRef} className="mt-10 space-y-10">
        {grouped.map((g) => (
          <section key={g.name} aria-label={g.name}>
            <h2 className="font-display text-3xl text-goldbright">{g.name}</h2>
            <div className="mt-4 space-y-4">
              {g.items.map((f) => (
                <details
                  key={f.q}
                  id={slug(f.q)}
                  className="scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/70 p-6"
                >
                  <summary className="cursor-pointer font-display text-2xl text-goldbright">
                    {f.q}
                  </summary>
                  {f.bullets ? (
                    <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-cream/85">
                      {f.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-3 whitespace-pre-line leading-relaxed text-cream/85">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

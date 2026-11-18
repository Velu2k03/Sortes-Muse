"use client";

import { useEffect, useRef, useState } from "react";

export type FaqItem = { q: string; a?: string; bullets?: string[]; group: string };

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
 * All-pages fix 10: one item, with its open state mirrored in
 * React. Native <details> already toggles on keyboard and the
 * browser exposes its state, but the audit CHECK asked for an
 * explicit aria-expanded in the DOM, and the summary had no visual
 * affordance at all (no chevron). The state is mirrored, not
 * owned: onToggle fires on every open change, including the
 * Expand all / Collapse all buttons and the hash opener, both of
 * which set el.open directly, so aria-expanded and the chevron
 * stay in sync without owning the open attribute. Timing is
 * already instant (measured ~106ms to toggle in the browser),
 * inside the transitions.dev 150-250ms band, so no grid-rows
 * grow animation is added.
 */
function FaqItem({ f }: { f: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      id={slug(f.q)}
      className="scroll-mt-24 rounded-3xl border border-gold/25 bg-panel/70 p-6"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        aria-expanded={open}
        className="flex cursor-pointer items-center justify-between gap-4 font-display text-2xl text-goldbright"
      >
        <span>{f.q}</span>
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {f.bullets ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-cream/85">
          {f.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {f.a ? (
        <p className="mt-3 whitespace-pre-line leading-relaxed text-cream/85">{f.a}</p>
      ) : null}
    </details>
  );
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
        <p className="text-sm text-gold">
          Jump to a question
        </p>
        {grouped.map((g) => (
          <div key={g.name} className="mt-4">
            <p className="text-sm font-semibold text-mist">
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
            <h2 className="font-display text-3xl text-cream">{g.name}</h2>
            <div className="mt-4 space-y-4">
              {g.items.map((f) => (
                <FaqItem key={f.q} f={f} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

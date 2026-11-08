"use client";

import { useEffect, useRef } from "react";

export type FaqItem = { q: string; a: string; bullets?: string[] };

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
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${hash}`);
    if (el && el.tagName === "DETAILS") {
      (el as HTMLDetailsElement).open = true;
    }
  }, []);

  const setAll = (open: boolean) => {
    listRef.current
      ?.querySelectorAll("details")
      .forEach((d) => {
        d.open = open;
      });
  };

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
        <ul className="mt-3 space-y-1.5">
          {faqs.map((f) => (
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
      </nav>
      <div ref={listRef} className="mt-10 space-y-4">
        {faqs.map((f) => (
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
    </div>
  );
}

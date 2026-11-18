"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useCanHide } from "@/lib/use-mounted";
import { SPREADS } from "@/lib/tarot";
import { SPREAD_SAMPLES } from "@/lib/spread-samples";
import SpreadDiagram from "@/components/SpreadDiagram";
import { GlareHover } from "@/components/ReactBitsNew";
import { useAuth, deviceHeldSession } from "@/components/AuthProvider";
import { freeReadingUsed } from "@/lib/storage";
import { isFreeAvailableFor } from "@/lib/free-reading";
import PageHeader from "@/components/PageHeader";
import FieldGroup from "@/components/FieldGroup";

/**
 * Spread selection.
 * Packs retired (Velu, 2026-11-16, D1): Oracles are bought via
 * subscriptions and top-ups, not packs. 1 Oracle = 1 full reading
 * of any spread. Spreads show numbered miniature card backs for
 * their card positions whether or not the seeker can start a
 * reading right now (no free reading left and 0 Oracles); the
 * moment they have an Oracle, the spread opens with "Begin
 * reading" and the gate offers the personalized intake.
 */
export default function SpreadsPage({
  initialPickedSlug = null,
}: {
  // URL state sync (all-pages fix 4): the server page reads
  // ?spread=<slug> and passes it in, so a refresh or a shared link
  // keeps the picked spread highlighted instead of clearing it.
  initialPickedSlug?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hide = useCanHide();
  // Deep UX Batch C: question picker. A newcomer should not have to
  // self-diagnose a spread name; they pick what they are asking
  // about, and the matching card is highlighted and scrolled to.
  const [pickedSlug, setPickedSlug] = useState<string | null>(initialPickedSlug);
  const pickSpread = (slug: string) => {
    setPickedSlug(slug);
    // URL state sync (all-pages fix 4): the pick is written as
    // ?spread=<slug>, so it survives a refresh and is shareable.
    // router.replace, not push: picking is not a navigation step,
    // so Back leaves the page instead of stepping through picks.
    // scroll: false keeps the scroll where pickSpread puts it.
    router.replace(`/spreads?spread=${slug}`, { scroll: false });
    document.getElementById(`spread-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  // Back/forward: the URL is the source of truth when it changes
  // without a pick. The server re-renders with a new
  // initialPickedSlug prop, but useState keeps the mounted value,
  // so the param has to be read back here. No scroll on a
  // back/forward restore: the seeker is navigating history, not
  // picking. No-op on mount and on our own replace, where the
  // param already matches the state.
  useEffect(() => {
    const raw = searchParams.get("spread");
    const next =
      raw && SPREADS.some((s) => s.slug === raw) ? raw : null;
    // Phase 4C lint: setState deferred a microtask past the effect,
    // the same pattern the codebase already uses for this rule.
    if (next !== pickedSlug) queueMicrotask(() => setPickedSlug(next));
  }, [searchParams, pickedSlug]);
  const { credits, user, freeReadingAvailable, authFailed, loading: authLoading } = useAuth();
  // Re-check fix: the session flag and the device free flag are read
  // in a mount effect, not during render. The server renders without
  // them, so reading them during render would hydrate mismatched
  // ("Free" on the server, "1 Oracle" on the client).
  const [usedFree, setUsedFree] = useState(false);
  const [hadSession, setHadSession] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      setUsedFree(freeReadingUsed());
      setHadSession(deviceHeldSession());
    });
  }, []);
  const balance = credits ?? 0;
  // Batch 1 (C1): signed-in users are decided by the server record,
  // guests by the device flag. See src/lib/free-reading.ts.
  // While auth is still loading the state is unknown, so the label
  // fails closed instead of showing "Free" from the device flag for
  // up to one /me round trip. Every "Free" label below reads this
  // value, never the raw device flag.
  const freeAvailable =
    !authLoading &&
    isFreeAvailableFor({
      slug: "quick-insight",
      signedIn: !!user,
      serverFree: freeReadingAvailable,
      deviceFree: !usedFree,
      hadSession,
      authFailed,
    });

  const canBegin = (slug: string) =>
    slug === "quick-insight" ? freeAvailable || balance >= 1 : balance >= 1;
  // AF-013: while the balance is unknown, a balance-gated card is
  // "pending", not locked. It shows a skeleton, never Locked.
  const isPending = (slug: string) =>
    credits === null && !(slug === "quick-insight" && freeAvailable);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="text-left">
        <PageHeader eyebrow="Readings" title="Choose your spread" titleClassName="sm:text-6xl" />
        <p className="mt-4 max-w-xl text-cream/75">
          {!freeAvailable
            ? "Each reading uses 1 Oracle, any spread. Oracles never expire."
            : "First Quick Insight free. After that, 1 Oracle, any spread."}
        </p>
        {/* Personal Phase 4, Decision 16: reflection disclaimer on
            the spread pages themselves, not only on FAQ. */}
        <p className="mt-3 max-w-xl text-xs italic text-mist">
          For reflection, not prediction.
        </p>
      </div>

      {/* Personal Phase 3: first-time guidance. The grid alone gives
          six equal choices; a new user needs one obvious start. This
          banner is a link only, it changes no gate, cost, or spread. */}
      {freeAvailable && (
        <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-center">
          <p className="font-display text-2xl text-goldbright">
            Start here, it is free
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-cream/75">
            One question. No Oracle, no payment card, no account.
          </p>
          <GlareHover className="mt-4 rounded-xl">
            <Link
              href="/spreads/quick-insight"
              className="btn-gold inline-block rounded-xl px-8 py-3 font-bold"
            >
              Start my free reading
            </Link>
          </GlareHover>
        </div>
      )}

      <FieldGroup className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3" aria-label="What are you asking about?">
        {[
          { label: "A decision", slug: "past-present-future" },
          { label: "A relationship", slug: "love-insight" },
          { label: "My career", slug: "career-path" },
          { label: "My week", slug: "weekly-outlook" },
          { label: "A deep dive", slug: "celtic-cross" },
          // Codex re-review, correct: once the free reading is
          // used, Quick Insight costs 1 Oracle, so the picker
          // must stop advertising it as free.
          { label: freeAvailable ? "Free first reading" : "Quick Insight", slug: "quick-insight" },
        ].map((o) => (
          <button
            key={o.slug}
            type="button"
            onClick={() => pickSpread(o.slug)}
            aria-pressed={pickedSlug === o.slug}
            className={`rounded-full px-4 py-3 text-sm font-semibold transition ${pickedSlug === o.slug ? "bg-gold text-ink" : "border border-gold/30 text-cream/90 hover:bg-gold/10"}`}
          >
            {o.label}
          </button>
        ))}
      </FieldGroup>

      {/* Batch 6c: one compact row per spread, not a grid of tall
          cards. The page was 5,239px on a phone. */}
      <div className="mt-10 space-y-4">
        {SPREADS.map((s, i) => {
          const pending = isPending(s.slug);
          const locked = !pending && !canBegin(s.slug);
          return (
          <motion.article
            id={`spread-${s.slug}`}
            key={`${s.slug}-${hide ? "reveal" : "static"}`}
            initial={hide ? { opacity: 0, y: 24 } : false}
            animate={{ opacity: 1, y: 0 }}
            // transitions.dev 150-250ms band: was duration 0.4s with
            // stagger i * 0.05, so the last spread finished at 0.65s.
            // Now 0.25s, stagger 0.04s, last spread done by 0.45s.
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className={`relative flex gap-4 overflow-hidden rounded-3xl border bg-panel/70 p-4 sm:gap-6 sm:p-5 ${pickedSlug === s.slug ? "border-gold shadow-gold-ring" : "border-gold/25"}`}
          >
            {/* Batch 6c: the diagram is a thumbnail now (Batch 4a's
                numbered badges are fixed 16px, so they stay legible
                at this size). The labels live in the "Positions in
                this spread" legend below; the diagram sizes itself
                from its own aspect ratio, so the old fixed-height
                squeeze that shrank the SVG labels to ~5.7px cannot
                come back. */}
            <div className="w-28 shrink-0 self-start sm:w-32">
              <SpreadDiagram spread={s} />
            </div>

            <div className="min-w-0 flex-1">
              {/* Phase 4A (4.5): the long "Past, Present, Future"
                  title used to collide with the price on one
                  no-wrap row. The row now wraps, and the title may
                  shrink, so the price drops below instead of
                  overlapping. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="min-w-0 flex-1 break-words font-display text-3xl text-cream">{s.name}</h2>
                <p className="shrink-0 whitespace-nowrap font-display text-xl text-goldbright">
                  {s.slug === "quick-insight" && freeAvailable ? "Free" : (<><span className="font-body">1</span> Oracle</>)}
                </p>
              </div>
              <p className="mt-1 text-sm text-mist">
                {s.cards} {s.cards === 1 ? "card" : "cards"}, personalized AI interpretation
              </p>
              {pending ? (
                <output
                  className="mt-4 block h-12 animate-pulse rounded-xl bg-gold/20 motion-reduce:animate-none"
                  aria-busy="true"
                  aria-label="Checking your Oracle balance"
                />
              ) : locked ? (
                <>
                  <Link
                    href="/pricing"
                    className="btn-ghost mt-4 rounded-xl border border-gold/30 px-4 py-3 text-center font-semibold"
                  >
                    Get Oracles to begin
                  </Link>
                  {/* Phase 5: locked cards used to offer only the
                      checkout button, so a spread detail page was
                      not discoverable from the index. This link
                      goes to the spread detail, which still gates
                      the reading itself, so nothing about the gate,
                      cost, or spread data changes. */}
                  <Link
                    href={`/spreads/${s.slug}`}
                    className="mt-3 block text-left text-sm font-semibold text-goldbright underline underline-offset-4"
                  >
                    View spread detail<span className="sr-only">: {s.name}</span>
                  </Link>
                </>
              ) : (
                <Link
                  href={`/spreads/${s.slug}`}
                  className="btn-ghost mt-4 block rounded-xl border border-gold/30 px-4 py-3 text-center font-semibold"
                >
                  {/* UX audit Phase 2, F23: every card says "Begin
                      reading". The free CTA appears once per screen,
                      in the hero banner above; the Quick Insight card
                      used to repeat it here. The card still shows its
                      price (Free). */}
                  Begin reading
                  <span className="sr-only">: {s.name}</span>
                </Link>
              )}
              <p className="mt-4 text-sm leading-relaxed text-cream/75">
                {s.description}
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-goldbright">Positions in this spread ({s.positions.length})</summary>
                {/* Batch 4a: numbered, so the numbers match the
                    badges on the diagram above. The old SVG had the
                    labels on it; the diagram now shows numbers only,
                    so this list is the only place that ties a number
                    to a position. */}
                <ol className="mt-2 space-y-1">
                  {s.positions.map((p, i) => (
                    <li key={p.key} className="flex gap-2 text-xs text-cream/80">
                      <span className="shrink-0 font-semibold text-goldbright">{i + 1}.</span>
                      <span>
                        <span className="text-goldbright">{p.label}</span>
                        {": "}
                        {p.hint}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
              {/* Sample reading, Phase 3 (3.7): one distinct sample
                  per spread from src/lib/spread-samples.ts, written
                  for that spread's positions. The old shared template
                  rendered the same Star / Sun / Magician meanings for
                  every spread. Template text, no AI generation, no
                  Oracle spent, clearly labelled. */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-goldbright">See a sample reading</summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs italic text-mist">Sample, not your reading. Your reading uses your question and your cards.</p>
                  <p className="text-xs leading-relaxed text-cream/80">
                    {SPREAD_SAMPLES[s.slug]}
                  </p>
                </div>
              </details>
            </div>
          </motion.article>
          );
        })}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-gold/20 bg-panel/50 p-6 text-center">
        <h2 className="font-display text-2xl text-cream">Oracles</h2>
        <p className="mt-2 text-sm leading-relaxed text-cream/75">
          Oracles never expire.{" "}
          <Link href="/faq#what-are-the-five-oracle-rules" className="font-semibold text-goldbright underline underline-offset-4">
            See all five Oracle rules
          </Link>
        </p>
        <Link
          href="/pricing"
          className="btn-ghost mt-4 rounded-xl px-6 py-3 text-sm font-semibold"
        >
          Top up Oracles
        </Link>
      </div>
    </div>
  );
}

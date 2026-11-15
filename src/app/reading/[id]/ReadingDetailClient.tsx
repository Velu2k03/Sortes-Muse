"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import ShareReading from "@/components/ShareReading";
import RavenOracle from "@/components/RavenOracle";
import { useFollowUp, useReading, useReadingField } from "./useReadingDetail";
import {
  AtAGlance,
  CardMeanings,
  CardRow,
  Interpretation,
  FollowUpThread,
  GuestKeepNotice,
  ThreeCardNudge,
  NewReadingPrompt,
  NextStepPanel,
  NotePanel,
  ReadingHeader,
  ReadingHeirloom,
  RevisitPanel,
} from "./ReadingSections";

/**
 * Reading detail: full cards + interpretation + share + "Ask a follow-up" upsell.
 * F30 (2026-11-09): a thin shell. State lives in the hooks in
 * useReadingDetail.ts; each visual section is in ReadingSections.tsx.
 */
export default function ReadingDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const { reading, setReading } = useReading(id, user);
  const [zoomCard, setZoomCard] = useState<string | null>(null);
  // Raven Oracle Step 1: a reading that just landed (the intake set
  // the sortes-just-revealed flag in sessionStorage) celebrates once
  // with a one-shot hop. A revisit shows the Raven gently instead.
  // The flag is read and cleared on mount, so it fires exactly once.
  // No raven-owned burst: TarotCard already fires one on every
  // reveal, and a second burst would stack on top of it.
  const [justRevealed, setJustRevealed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // queueMicrotask, the daily page's pattern: the setState must not
    // run synchronously in the effect body (react-hooks/set-state-
    // in-effect is an error in this repo). The cancelled flag drops
    // a stale callback if the effect is cleaned up (unmount, or the
    // reading id changes) before the microtask runs, so it never
    // reads the reveal marker or sets state for a stale setup.
    queueMicrotask(() => {
      if (cancelled) return;
      let revealed = false;
      try {
        revealed = window.sessionStorage.getItem("sortes-just-revealed") === id;
        if (revealed) window.sessionStorage.removeItem("sortes-just-revealed");
      } catch {
        // Storage unavailable: no celebration, the reading still opens.
      }
      setJustRevealed(revealed);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  // M1.1: the one next step the seeker chooses after reading. Kept in
  // local state for editing, saved onto the reading on Save.
  const nextStep = useReadingField(reading, setReading, (r) => r.nextStep);
  // M2.2: 7-day revisit note.
  const revisit = useReadingField(reading, setReading, (r) => r.revisitNote);
  // Phase E (item 8): the general note field, separate from the
  // revisit note.
  const note = useReadingField(reading, setReading, (r) => r.note);
  // M2.1: follow-up thread state
  const followUp = useFollowUp(reading, setReading);

  if (reading === undefined) {
    return <p className="py-20 text-center text-mist">Loading…</p>;
  }

  if (reading === null) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-4xl text-goldbright">Reading not found</h1>
        <p className="mt-4 text-cream/75">
          This reading is not in your journal on this device.
        </p>
        <Link href="/spreads" className="btn-gold mt-8 inline-block rounded-xl px-8 py-3 font-bold">
          Begin a new reading
        </Link>
      </div>
    );
  }

  const hasFollowUpThread = Boolean(
    reading.aiGenerated && reading.interpretation && !reading.chartSummary
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <ReadingHeader reading={reading} />
      {/* Raven Oracle Step 1: celebrates a fresh reveal once with a
          one-shot hop; sits gently on a revisit. */}
      <div className="relative mt-8 flex flex-col items-center">
        <RavenOracle state={justRevealed ? "celebrating" : "gentle"} size={140} />
        {justRevealed && (
          <p className="mt-2 text-center text-sm italic text-cream/75">
            Your reading is ready.
          </p>
        )}
      </div>
      {!user && <GuestKeepNotice />}
      {reading.free && reading.spreadSlug === "quick-insight" && <ThreeCardNudge />}
      <AtAGlance reading={reading} />
      <CardRow reading={reading} zoomCard={zoomCard} setZoomCard={setZoomCard} />
      {/* Batch 6c: the interpretation first, the card blocks in one
          collapsed section below it. */}
      <Interpretation reading={reading} />
      <CardMeanings reading={reading} />

      <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-mist">
        Want the astrology side of this question?{" "}
        <Link href="/charts" className="font-semibold text-goldbright underline underline-offset-4">
          Cast a birth chart for it
        </Link>
      </p>
      <p className="mx-auto mt-4 max-w-3xl text-center text-sm text-mist">
        Your story is not shown here on purpose: it was used for this reading only and is not saved.
      </p>

      <NextStepPanel field={nextStep} />
      <NotePanel reading={reading} field={note} />
      <RevisitPanel reading={reading} field={revisit} />

      <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-gold/25 bg-panel/60 p-6 text-center sm:p-8">
        <ShareReading
          spreadName={reading.spreadName}
          drawn={reading.cards}
          date={reading.createdAt}
          interpretation={reading.interpretation}
        />
        <ReadingHeirloom reading={reading} />
        {hasFollowUpThread && (
          <FollowUpThread reading={reading} isGuest={!user} f={followUp} />
        )}
        {!hasFollowUpThread && <NewReadingPrompt />}
      </div>

      <p className="mx-auto mt-8 max-w-md text-center text-xs italic leading-relaxed text-mist">
        For reflection and perspective, not guaranteed predictions.
      </p>
    </div>
  );
}

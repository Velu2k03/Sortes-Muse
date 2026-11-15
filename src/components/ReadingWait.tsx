"use client";

import { useEffect, useState } from "react";
import "./ReadingWait.css";
import StatusMark from "@/components/StatusMark";
import FoldText from "@/components/FoldText";
import WaitDeck from "@/components/WaitDeck";
import type { DrawnCard } from "@/lib/types";

export const PROCESSING_LINES = [
  "Casting the lots",
  "Drawing your cards",
  "Reading your story",
  "Putting it together",
];

export default function ReadingWait({
  activeStep,
  complete,
  drawnCards,
}: {
  activeStep: number;
  complete: boolean;
  /** Batch 10: the drawn cards, shown as an animated deck above the
      status lines so the wait is visual, not blank. Optional so the
      component still works without them. */
  drawnCards?: DrawnCard[] | null;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");

  return (
    <div className="reading-wait" aria-live="polite">
      {drawnCards && drawnCards.length > 0 && (
        <div className="mb-6">
          <WaitDeck drawnCards={drawnCards} />
        </div>
      )}
      {complete && (
        <FoldText
          text="Your reading is ready"
          trigger="mount"
          color="var(--color-goldbright)"
          fontSize="1.75rem"
          className="mb-4"
        />
      )}
      {/* Batch 3.2 (#55-#58, #71): one honest indicator, the stage
          trace, driven by real SSE events. The ThoughtLine and the
          LatticeLoader showed the same current line a second and
          third time, so they are gone. The trace is the indicator:
          the running step breathes, done steps are marked, and the
          elapsed stopwatch plus the honest "up to about 3 minutes"
          tell the user how long it is taking. */}
      <ol className={`reading-trace${complete ? " reading-trace--complete" : ""}`}>
        {PROCESSING_LINES.map((line, index) => (
          <li
            key={line}
            hidden={complete && index !== PROCESSING_LINES.length - 1}
            aria-current={!complete && activeStep === index ? "step" : undefined}
            className={
              activeStep === index || (complete && index === PROCESSING_LINES.length - 1)
                ? "reading-trace__step is-current"
                : "reading-trace__step"
            }
          >
            <span className="reading-trace__marker" aria-hidden="true">
              <StatusMark
                status={
                  complete || index < activeStep
                    ? "done"
                    : index === activeStep
                      ? "running"
                      : "pending"
                }
                size={22}
                color="var(--color-gold)"
                doneColor="var(--color-gold)"
              />
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>

      {/* Batch 3.2: the elapsed stopwatch stays. The LatticeLoader
          that used to sit beside it is gone (one indicator now). */}
      <div className="reading-stopwatch" role="timer" aria-live="off">
        <span className="reading-stopwatch__time">
          {minutes}:{seconds}
        </span>
        <span className="reading-stopwatch__label">elapsed</span>
      </div>

      {/* "About 3 minutes" is the 170 s AI retry budget (AI_RETRY_TOTAL_TIMEOUT_MS,
          2m50s) plus overhead, not a measured p95. A generation that overruns the
          budget fails with no reading delivered, so a delivered reading takes at
          most ~170 s + overhead. */}
      {!complete && (
        <p className="mt-4 max-w-sm text-sm text-mist">
          Writing your reading.
          This can take up to about 3 minutes.
        </p>
      )}
    </div>
  );
}

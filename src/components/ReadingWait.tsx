"use client";

import { useEffect, useState } from "react";
import "./ReadingWait.css";
import LatticeLoader from "@/components/LatticeLoader";
import ThoughtLine from "@/components/ThoughtLine";
import StatusMark from "@/components/StatusMark";
import FoldText from "@/components/FoldText";

export const PROCESSING_LINES = [
  "Casting the lots",
  "Drawing your cards",
  "Reading your story",
  "Putting it together",
];

export default function ReadingWait({
  activeStep,
  complete,
}: {
  activeStep: number;
  complete: boolean;
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

  const currentLine = complete
    ? PROCESSING_LINES[PROCESSING_LINES.length - 1]
    : PROCESSING_LINES[Math.min(activeStep, PROCESSING_LINES.length - 1)];

  return (
    <div className="reading-wait" aria-live="polite">
      {complete && (
        <FoldText
          text="Your reading is ready"
          trigger="mount"
          color="#f4d03f"
          fontSize="1.75rem"
          className="mb-4"
        />
      )}
      {!complete && (
        <ThoughtLine
          label={currentLine}
          working
          color="#d4af37"
          showTimer={false}
        />
      )}
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
                color="#d4af37"
                doneColor="#d4af37"
              />
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>

      <div className="lattice-loader-row">
        <LatticeLoader
          label={currentLine}
          doneLabel="Done"
          status={complete ? "done" : "working"}
          color="#d4af37"
          doneColor="#d4af37"
          showTimer={false}
          elapsed={elapsedSeconds}
          glow
        />
        <div className="reading-stopwatch" role="timer" aria-live="off">
          <span className="reading-stopwatch__time">
            {minutes}:{seconds}
          </span>
          <span className="reading-stopwatch__label">elapsed</span>
        </div>
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

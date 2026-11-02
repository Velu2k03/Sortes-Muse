"use client";

import { useEffect, useState, type CSSProperties } from "react";
import "./ReadingWait.css";

export const PROCESSING_LINES = [
  "Casting the lots",
  "Drawing your cards",
  "Reading your story",
  "Weaving the cards together",
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

  return (
    <div className="reading-wait" aria-live="polite">
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
              {complete || index < activeStep ? "✓" : index + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>

      <div className="lattice-loader-row">
        <div className="lattice-loader" aria-hidden="true">
          {Array.from({ length: 25 }, (_, index) => (
            <span
              key={index}
              className="lattice-loader__cell"
              style={{ "--cell-index": index } as CSSProperties}
            />
          ))}
        </div>
        <div className="reading-stopwatch" role="timer" aria-live="off">
          <span className="reading-stopwatch__time">
            {minutes}:{seconds}
          </span>
          <span className="reading-stopwatch__label">elapsed</span>
        </div>
      </div>

      <p className="mt-4 max-w-sm text-sm text-mist">
        Breathe slowly. Your cards are being drawn and your story woven into their meanings.
        This usually takes a few seconds.
      </p>
    </div>
  );
}

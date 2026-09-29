"use client";

import { useEffect, useState } from "react";

/**
 * Honest social proof: real count of readings cast in the last 7 days.
 * Hidden until the number is meaningful (>= 25), so we never show a sad
 * "3 readings" strip and never fake a number.
 */
const MIN_TO_SHOW = 25;

export default function StatsStrip() {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) =>
        setN(typeof d.readingsThisWeek === "number" ? d.readingsThisWeek : 0)
      )
      .catch(() => setN(0));
  }, []);

  if (n === null || n < MIN_TO_SHOW) return null;

  return (
    <div className="border-y border-gold/10 bg-navydeep/50">
      <p className="mx-auto max-w-6xl px-4 py-4 text-center text-sm text-cream/70">
        <span className="font-display text-2xl text-goldbright">
          {n.toLocaleString()}
        </span>{" "}
        readings cast in the last 7 days · join the seekers
      </p>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toPng } from "html-to-image";
import { getCard } from "@/lib/cards";
import { computeSpreadFacts } from "@/lib/spread-facts";
import { firstSentence } from "@/lib/story-card";
import type { DrawnCard } from "@/lib/types";
import { APP_SHORT, TAGLINE } from "@/lib/site";

/**
 * Phase 5 (5.5): shareable 9:16 story cards (1080x1920). The drawn
 * spread, a dominant-element badge computed from the actual cards,
 * a one-sentence takeaway taken from the real reading text (never
 * invented), and a subtle sortes.resonantatlas.com watermark.
 * Exports as a PNG via html-to-image for social sharing.
 */
export default function ShareReading({
  spreadName,
  drawn,
  date,
  interpretation,
}: {
  spreadName: string;
  drawn: DrawnCard[];
  date: string;
  interpretation?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (!ref.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 1,
        backgroundColor: "#0a0e1a",
      });
      const a = document.createElement("a");
      a.download = `sortes-story-${date.slice(0, 10)}.png`;
      a.href = dataUrl;
      a.click();

      // Prefer the native share sheet when available.
      if (navigator.share) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], "sortes-story.png", {
            type: "image/png",
          });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `${APP_SHORT} reading`,
              text: `My ${spreadName} reading. ${TAGLINE}`,
            });
          }
        } catch {
          /* user dismissed the share sheet; download already happened */
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const shown = drawn.slice(0, 6);
  // Dominant element from the actual cards drawn, not a guess.
  const facts = computeSpreadFacts(
    drawn.map((d) => {
      const c = getCard(d.cardId);
      return {
        cardId: d.cardId,
        name: c.name,
        reversed: d.reversed,
        position: d.position,
        arcana: c.arcana,
        suit: c.suit,
        number: c.number,
      };
    })
  );
  const takeaway = firstSentence(interpretation);

  return (
    <>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="btn-ghost rounded-xl px-6 py-3 font-semibold disabled:opacity-100 disabled:saturate-50"
      >
        {busy ? "Creating image…" : "⤴ Share as story (9:16)"}
      </button>

      {/* Offscreen render target (1080x1920, vertical story) */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: 1080,
          height: 1920,
        }}
      >
        <div
          ref={ref}
          style={{
            width: 1080,
            height: 1920,
            background: "#0a0e1a",
            color: "#ede6d6",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "110px 80px 70px",
            fontFamily: "Cormorant Garamond, Georgia, serif",
            border: "3px solid #d4af37",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: 34, letterSpacing: 12, color: "#d4af37" }}>
            SORTES
          </div>
          <div style={{ fontSize: 64, marginTop: 28, textAlign: "center", lineHeight: 1.15 }}>
            {spreadName}
          </div>
          {facts.dominantElement && (
            <div
              style={{
                marginTop: 30,
                fontSize: 26,
                color: "#0a0e1a",
                background: "#d4af37",
                borderRadius: 999,
                padding: "10px 28px",
                letterSpacing: 2,
              }}
            >
              Dominant element: {facts.dominantElement}
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 28,
              marginTop: 56,
              justifyContent: "center",
              maxWidth: 920,
            }}
          >
            {shown.map((d) => {
              const c = getCard(d.cardId);
              return (
                <div key={d.positionKey} style={{ textAlign: "center", width: 240 }}>
                  <Image
                    src={c.image}
                    alt=""
                    width={240}
                    height={403}
                    unoptimized
                    style={{
                      borderRadius: 14,
                      border: "1px solid #d4af37",
                      transform: d.reversed ? "rotate(180deg)" : undefined,
                    }}
                  />
                  <div style={{ fontSize: 24, marginTop: 12, color: "#f4d03f" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 19, color: "#9ca3af" }}>
                    {d.position}
                  </div>
                </div>
              );
            })}
          </div>
          {takeaway && (
            <div
              style={{
                fontSize: 30,
                fontStyle: "italic",
                lineHeight: 1.5,
                marginTop: 64,
                textAlign: "center",
                maxWidth: 880,
              }}
            >
              &ldquo;{takeaway}&rdquo;
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 22, fontStyle: "italic", color: "#9ca3af", textAlign: "center" }}>
            {TAGLINE}
          </div>
          <div style={{ fontSize: 20, letterSpacing: 3, color: "#d4af37", marginTop: 12 }}>
            sortes.resonantatlas.com
          </div>
        </div>
      </div>
    </>
  );
}

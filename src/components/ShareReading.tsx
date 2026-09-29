"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { getCard } from "@/lib/cards";
import type { DrawnCard } from "@/lib/types";
import { APP_SHORT, TAGLINE, SITE_URL } from "@/lib/site";

/**
 * Renders a shareable reading card offscreen and exports it as a PNG
 * via html-to-image for social sharing.
 */
export default function ShareReading({
  spreadName,
  drawn,
  date,
}: {
  spreadName: string;
  drawn: DrawnCard[];
  date: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (!ref.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0a0e1a",
      });
      const a = document.createElement("a");
      a.download = `sortes-reading-${date.slice(0, 10)}.png`;
      a.href = dataUrl;
      a.click();

      // Prefer the native share sheet when available.
      if (navigator.share) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], "sortes-reading.png", {
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

  return (
    <>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="btn-ghost rounded-xl px-6 py-3 font-semibold disabled:opacity-60"
      >
        {busy ? "Creating image…" : "⤴ Share as image"}
      </button>

      {/* Offscreen render target (1200x630, OG proportions) */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: 1200,
          height: 630,
        }}
      >
        <div
          ref={ref}
          style={{
            width: 1200,
            height: 630,
            background: "#0a0e1a",
            color: "#ede6d6",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 60,
            fontFamily: "Georgia, serif",
            border: "2px solid #d4af37",
          }}
        >
          <div style={{ fontSize: 28, letterSpacing: 8, color: "#d4af37" }}>
            SORTES
          </div>
          <div style={{ fontSize: 54, marginTop: 12 }}>{spreadName}</div>
          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 36,
              alignItems: "center",
            }}
          >
            {shown.map((d) => {
              const c = getCard(d.cardId);
              return (
                <div key={d.positionKey} style={{ textAlign: "center" }}>
                  <img
                    src={c.image}
                    alt=""
                    width={120}
                    height={201}
                    style={{
                      borderRadius: 12,
                      border: "1px solid #d4af37",
                      transform: d.reversed ? "rotate(180deg)" : undefined,
                    }}
                  />
                  <div style={{ fontSize: 18, marginTop: 8, color: "#f4d03f" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 14, color: "#9ca3af" }}>
                    {d.position}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 22, fontStyle: "italic", marginTop: 36, color: "#9ca3af" }}>
            {TAGLINE} · {SITE_URL.replace("https://", "")}
          </div>
        </div>
      </div>
    </>
  );
}

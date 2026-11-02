"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { SPREADS } from "@/lib/tarot";
import "./ReactBits.css";

export function DarkVeil() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const veil = ref.current;
    const hero = veil?.parentElement?.parentElement;
    if (!hero) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onPointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch") return;
      const bounds = hero.getBoundingClientRect();
      hero.style.setProperty("--veil-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      hero.style.setProperty("--veil-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    };
    const syncMotion = () => {
      if (motionPreference.matches) {
        hero.removeEventListener("pointermove", onPointerMove);
      } else {
        hero.addEventListener("pointermove", onPointerMove, { passive: true });
      }
    };

    syncMotion();
    motionPreference.addEventListener("change", syncMotion);
    return () => {
      motionPreference.removeEventListener("change", syncMotion);
      hero.removeEventListener("pointermove", onPointerMove);
      hero.style.removeProperty("--veil-x");
      hero.style.removeProperty("--veil-y");
    };
  }, []);

  return <div ref={ref} className="dark-veil" aria-hidden="true" />;
}

export function ShinyText({ children }: { children: ReactNode }) {
  return <span className="shiny-text">{children}</span>;
}

interface Burst {
  id: number;
  x: number;
  y: number;
}

export function ClickSpark({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const spark = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const burst = {
      id: Date.now() + Math.random(),
      x: event.detail === 0 ? bounds.width / 2 : event.clientX - bounds.left,
      y: event.detail === 0 ? bounds.height / 2 : event.clientY - bounds.top,
    };
    setBursts((current) => [...current, burst]);
    const timer = setTimeout(() => {
      setBursts((current) => current.filter(({ id }) => id !== burst.id));
      timers.current.delete(timer);
    }, 560);
    timers.current.add(timer);
  };

  return (
    <span className={`click-spark ${className}`} onClick={spark}>
      {children}
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className="click-spark__burst"
          style={{ left: burst.x, top: burst.y } as CSSProperties}
          aria-hidden="true"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <i
              key={index}
              style={{ "--spark-angle": `${index * 45}deg` } as CSSProperties}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

export function StarBorder({
  children,
  radius = "1rem",
  className = "",
}: {
  children: ReactNode;
  radius?: string;
  className?: string;
}) {
  return (
    <span
      className={`star-border-frame ${className}`}
      style={{ "--star-radius": radius } as CSSProperties}
    >
      {children}
      <span className="star-border__light" aria-hidden="true" />
    </span>
  );
}

function updateBentoPosition(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === "touch") return;
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--bento-x", `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty("--bento-y", `${event.clientY - bounds.top}px`);
}

function startBentoWave(event: React.MouseEvent<HTMLElement>) {
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const x = event.detail === 0 ? bounds.width / 2 : event.clientX - bounds.left;
  const y = event.detail === 0 ? bounds.height / 2 : event.clientY - bounds.top;
  card.style.setProperty("--wave-x", `${x}px`);
  card.style.setProperty("--wave-y", `${y}px`);
  card.dataset.wave = "true";
  window.setTimeout(() => {
    delete card.dataset.wave;
  }, 650);
}

export function MagicBento() {
  return (
    <div className="magic-bento mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
      {SPREADS.map((spread) => (
        <article
          key={spread.slug}
          className="magic-bento__card relative overflow-hidden rounded-3xl border border-gold/25 bg-panel/70 p-7"
          onPointerMove={updateBentoPosition}
          onPointerLeave={(event) => {
            event.currentTarget.style.removeProperty("--bento-x");
            event.currentTarget.style.removeProperty("--bento-y");
          }}
          onClick={startBentoWave}
        >
          <span className="magic-bento__edge" aria-hidden="true" />
          {spread.slug === "quick-insight" && (
            <span className="absolute right-4 top-4 rounded-full bg-gold px-3 py-1 text-xs font-bold text-ink">
              FIRST FREE
            </span>
          )}
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.25em] text-mist">
              {spread.cards} {spread.cards === 1 ? "card" : "cards"}
            </p>
            <h3 className="mt-2 font-display text-3xl text-cream">{spread.name}</h3>
            <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-cream/75">
              {spread.description}
            </p>
            <p className="mt-4 font-display text-2xl text-goldbright">
              {spread.slug === "quick-insight" ? "Free" : "1 credit"}
            </p>
            {spread.slug === "quick-insight" ? (
              <StarBorder
                radius="0.75rem"
                className="star-border-frame--block mt-5"
              >
                <ClickSpark className="click-spark--block">
                  <Link
                    href={`/spreads/${spread.slug}`}
                    className="btn-gold block rounded-xl px-4 py-3 text-center font-semibold"
                  >
                    Start free reading
                  </Link>
                </ClickSpark>
              </StarBorder>
            ) : (
              <Link
                href={`/spreads/${spread.slug}`}
                className="btn-ghost mt-5 block rounded-xl px-4 py-3 text-center font-semibold"
              >
                View spread
              </Link>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

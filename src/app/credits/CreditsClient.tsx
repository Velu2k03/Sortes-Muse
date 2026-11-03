"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { CREDIT_PACKS, perReadingPrice } from "@/lib/site";
import { getPurchaseHistory, type Purchase } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import CheckoutModal from "@/components/CheckoutModal";
import PurchaseConfirmer from "@/components/PurchaseConfirmer";
import SampleReading from "@/components/SampleReading";
import Counter from "@/components/Counter";
import PixelCard from "@/components/PixelCard";
import { useSearchParams } from "next/navigation";

interface ServerTx {
  id: string;
  pack_type: string;
  amount: number;
  readings: number;
  created_at: string;
}

// Pack badge artwork: the same Flow images used as the Lemon Squeezy
// product covers, downscaled to 160px thumbnails in public/packs so the
// cards stay light on mobile. The pack name sits right beside the image,
// so the image itself is decorative.
const PACK_IMAGES: Record<string, string> = {
  "pack-5": "/packs/first-light.jpg",
  "pack-12": "/packs/constellation.jpg",
  "pack-30": "/packs/celestial-treasury.jpg",
};

export default function CreditsPage() {
  const { credits, user } = useAuth();
  const searchParams = useSearchParams();
  const justPurchased = searchParams.get("purchase") === "success";
  const [open, setOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // PixelCard needs an explicit theme (its canvas does not read the
  // CSS variables), so track the document theme the same way theme.js
  // sets it. The popular card renders gold pixels on a dark surface in
  // dark mode and dark-gold pixels on a light surface in light mode.
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const sync = () =>
      setSiteTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const [localHistory, setLocalHistory] = useState<Purchase[]>([]);
  const [serverTx, setServerTx] = useState<ServerTx[] | null>(null);

  useEffect(() => {
    if (user) {
      fetch("/api/credits/transactions")
        .then((r) => r.json())
        .then((d) => setServerTx(d.transactions ?? []))
        .catch(() => setServerTx([]));
    } else {
      queueMicrotask(() => {
        setLocalHistory(getPurchaseHistory());
        setServerTx(null);
      });
    }
  }, [user]);

  return (
    <div>
      {justPurchased && <PurchaseConfirmer />}
      {/* Header now lives in the server page, see page.tsx, so the
          H1 is in the initial HTML. Balance stays centered here. */}
      <div className="text-center">
        {reducedMotion ? (
          <p className="num mt-6 text-7xl font-bold text-cream">
            {credits ?? 0}
            <span className="ml-2 align-middle font-body text-lg text-mist">
              {(credits ?? 0) === 1 ? "Oracle" : "Oracles"}
            </span>
          </p>
        ) : (
          <div className="mt-6 flex items-baseline justify-center gap-2">
            <Counter
              value={credits ?? 0}
              textColor="#ede6d6"
              fontSize={72}
              fontWeight="bold"
            />
            <span className="font-body text-lg text-mist">
              {(credits ?? 0) === 1 ? "Oracle" : "Oracles"}
            </span>
          </div>
        )}
        <p className="mx-auto mt-4 max-w-md text-sm text-cream/75">
          1 Oracle = 1 full reading. Your daily card is always
          free and never uses an Oracle. Oracles never expire.
          {user && <span className="block mt-1 text-mist">Signed in as {user.email}</span>}
        </p>
        <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-sm text-cream/75">
          <li>Free first: your first Quick Insight reading is free.</li>
          <li>Free first chart: your first interpretation in each chart system (Ziwei, Western, Vedic) is free. Chart calculation alone is always free.</li>
          <li>Free first follow-up: your first follow-up per reading is free.</li>
          <li>Paid after that: 1 Oracle per full tarot reading or full chart interpretation.</li>
          <li>No subscription: buy a pack once, use it whenever you like.</li>
        </ul>
        <p className="mx-auto mt-4 max-w-md text-sm text-cream/75">An Oracle opens a reading. It is not a prediction, a promise, or a guarantee.</p>
      </div>

      <div className="mt-10 space-y-4">
        {CREDIT_PACKS.map((p, i) => {
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={PACK_IMAGES[p.id]}
                    alt=""
                    aria-hidden="true"
                    className="h-9 w-9 shrink-0 rounded-xl border border-gold/30 object-cover"
                  />
                  <p className="font-display text-xl text-cream">{p.name}</p>
                </div>
                {p.popular && (
                  <span className="shrink-0 whitespace-nowrap pt-1 text-xs font-bold text-goldbright">
                    Most popular
                  </span>
                )}
              </div>
              <p className="num mt-5 text-5xl font-bold text-cream">
                ${p.price.toFixed(2)}
              </p>
              <p className="mt-1 text-sm text-mist">one-time payment</p>
              <p className="mt-3 text-base text-cream">
                <span className="font-body text-cream">{p.readings}</span> Oracles · ${perReadingPrice(p)} per Oracle
              </p>
              <ul className="mt-4 space-y-2 text-sm text-cream/85">
                <li>✓ 1 Oracle = 1 full reading</li>
                <li>✓ Oracles never expire</li>
                <li>✓ Any spread, any chart system</li>
                <li>✓ No subscription, pay once</li>
              </ul>
              {/* Audit 4: every pack uses the same solid btn-gold, same
                  padding, weight, and size. */}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="btn-gold mt-5 w-full rounded-xl px-4 py-3 font-bold"
              >
                Buy {p.readings} Oracles · ${p.price.toFixed(2)}
              </button>
            </>
          );
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
              className={p.popular ? "relative" : "relative rounded-3xl border border-gold/20 bg-panel/60 p-6"}
            >
              {p.popular ? (
                <PixelCard
                  variant="yellow"
                  gap={4}
                  pixelSize={1.8}
                  speed={20}
                  glow={0.6}
                  glowColor="#eab308"
                  theme={siteTheme}
                  radius={24}
                  className="border border-gold/70"
                >
                  <div className="relative z-10 p-6">{body}</div>
                </PixelCard>
              ) : (
                body
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-10 rounded-2xl border border-gold/20 bg-panel/50 p-6">
        <p className="font-display text-xl text-goldbright">Purchase history</p>
        {user ? (
          serverTx === null ? (
            <p className="mt-2 text-sm text-mist">Loading…</p>
          ) : serverTx.length === 0 ? (
            <p className="mt-2 text-sm text-mist">
              No purchases yet. Every transaction (pack, amount, date) will be
              listed here.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {serverTx.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gold/15 bg-panel/40 px-4 py-3 text-sm"
                >
                  <span className="text-cream">
                    {t.readings} Oracles · {t.pack_type}
                  </span>
                  <span className="shrink-0 text-mist">
                    ${Number(t.amount).toFixed(2)} ·{" "}
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : localHistory.length === 0 ? (
          <p className="mt-2 text-sm text-mist">
            No purchases yet on this device.{" "}
            <Link href="/account" className="text-goldbright underline">
              Sign in
            </Link>{" "}
            to keep your receipts synced to your account.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {localHistory.map((p, i) => (
              <li
                key={`${p.date}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-gold/15 bg-panel/40 px-4 py-3 text-sm"
              >
                <span className="text-cream">
                  {p.readings} Oracles · {p.packId}
                </span>
                <span className="shrink-0 text-mist">
                  ${p.price.toFixed(2)} · {new Date(p.date).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mx-auto mt-8 max-w-md text-center text-xs leading-relaxed text-mist">
        Pay-per-reading, no subscriptions. Prices include everything; there
        are no hidden fees. Secure checkout is powered by Lemon Squeezy.
      </p>

      {/* M2.2: the same labeled paid-reading sample as the home page,
          so buyers see exactly what a reading contains before paying. */}
      <div className="mt-10">
        <SampleReading />
      </div>

      <CheckoutModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { CREDIT_PACKS, apiPackId, perReadingPrice } from "@/lib/site";
import { getPurchaseHistory, type Purchase } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import CheckoutModal from "@/components/CheckoutModal";
import PurchaseConfirmer from "@/components/PurchaseConfirmer";
import SampleReading from "@/components/SampleReading";
import Counter from "@/components/Counter";
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

// Positioning line under each pack name, the way premium pricing cards
// name who the tier is for. Kept local like PACK_IMAGES so no pricing
// file changes.
const PACK_TAGLINES: Record<string, string> = {
  "pack-5": "A quiet place to begin",
  "pack-12": "A steady rhythm of readings",
  "pack-30": "Room for every question",
};

export default function CreditsPage() {
  const { credits, user } = useAuth();
  const searchParams = useSearchParams();
  const justPurchased = searchParams.get("purchase") === "success";
  const [open, setOpen] = useState(false);
  const [modalPack, setModalPack] = useState<string | null>(null);
  const [directProcessing, setDirectProcessing] = useState<string | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directFailed, setDirectFailed] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // Counter numbers take a hard colour, not a theme token, so
  // track the document theme the same way theme.js sets it, and
  // pass a dark colour in light mode and a light colour in dark
  // mode. See the light numbers fix, 2026-11-04.
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    const sync = () =>
      setSiteTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  // Direct checkout from a pack card, as approved 2026-11-04: the
  // card button goes straight to Lemon Squeezy for that pack, no
  // re-pick in the modal. Signed-in visitors have an email on file,
  // so they redirect at once. Guests have no email yet and the
  // checkout API needs one before Lemon Squeezy, so a guest gets
  // the modal only as the email step, with their pack marked
  // Selected, not as a second pick. Demo mode (Lemon not
  // configured) also falls back to the modal, where demo Buy lives.
  const buyDirect = async (packId: string) => {
    setDirectError(null);
    setDirectFailed(null);
    if (!user) {
      setModalPack(packId);
      setOpen(true);
      return;
    }
    setDirectProcessing(packId);
    try {
      const enabledRes = await fetch("/api/checkout/lemonsqueezy");
      const enabledData = await enabledRes.json().catch(() => ({}));
      if (!enabledData.enabled) {
        setModalPack(packId);
        setOpen(true);
        return;
      }
      const res = await fetch("/api/checkout/lemonsqueezy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: apiPackId(packId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Checkout failed.");
      if (!data.url) throw new Error("Checkout failed.");
      window.location.href = data.url;
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : "Checkout failed.");
      setDirectFailed(packId);
    } finally {
      setDirectProcessing(null);
    }
  };
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
              textColor={siteTheme === "light" ? "#1c1a15" : "#ede6d6"}
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
          // Centered cards, approved 2026-11-04: every card is
          // centered, like the React Bits showcase cards, not left
          // aligned. The popular card is the colored one, a gold
          // card with dark text in both themes, so it stands out
          // against the panel cards. On a gold card the theme
          // tokens would be wrong, so text colours are dark here.
          const colored = !!p.popular;
          const nameClass = colored ? "text-[#14100a]" : "text-cream";
          const mistClass = colored ? "text-[#14100a]/70" : "text-mist";
          const bodyClass = colored ? "text-[#14100a]/85" : "text-cream/85";
          const priceColor = colored
            ? "#14100a"
            : siteTheme === "light"
              ? "#7c5e00"
              : "#f4d03f";
          const body = (
            <div className="text-center">
              <img
                src={PACK_IMAGES[p.id]}
                alt=""
                aria-hidden="true"
                className="mx-auto h-12 w-12 rounded-xl border border-gold/30 object-cover"
              />
              <p className={`mt-3 font-display text-2xl ${nameClass}`}>{p.name}</p>
              {p.popular && (
                <span className="mt-2 inline-block rounded-full bg-[#14100a] px-3 py-1 text-xs font-bold text-[#f4d03f]">
                  Most popular
                </span>
              )}
              <p className={`mt-2 text-sm ${mistClass}`}>{PACK_TAGLINES[p.id]}</p>
              {/* Stylish number: React Bits Counter, rolling digits
                  in the display serif, not plain Inter. Reduced
                  motion shows the final price at once, see Counter. */}
              <div className="mt-5 flex justify-center">
                <Counter
                  value={p.price}
                  decimals={2}
                  prefix="$"
                  fontSize={56}
                  fontWeight="bold"
                  textColor={priceColor}
                  className="font-display"
                />
              </div>
              <p className={`mt-1 text-sm ${mistClass}`}>Single payment</p>
              <p className={`mt-3 text-base ${nameClass}`}>
                <span className="font-display text-xl">{p.readings}</span> Oracles · ${perReadingPrice(p)} per Oracle
              </p>
              {/* 3 points only, approved 2026-11-04. Dropped point:
                  "No tarot knowledge needed", the least specific
                  of the four. Kept: included products, one-reading
                  story use, history. */}
              <ul className={`mx-auto mt-4 max-w-xs space-y-2 text-sm ${bodyClass}`}>
                <li>✓ Tarot readings, birth charts, and reports included</li>
                <li>✓ Your story is used for one reading only</li>
                <li>✓ Your readings stay in your history</li>
              </ul>
              {/* Audit 4: every pack uses the same solid btn-gold, same
                  padding, weight, and size. */}
              {/* Direct checkout, approved 2026-11-04: this button goes
                  straight to Lemon Squeezy for this card's pack.
                  The modal stays for spreads, header, and reading
                  flows, where no pack was picked yet, and for guests
                  and demo mode here, where an email step or demo Buy
                  is still needed. */}
              <button
                type="button"
                disabled={directProcessing !== null}
                onClick={() => void buyDirect(p.id)}
                className="btn-gold mt-5 w-full rounded-xl px-4 py-3 font-bold disabled:opacity-60"
              >
                {directProcessing === p.id ? "…" : "Checkout"}
              </button>
              {directError && directFailed === p.id && (
                <p className="mt-2 text-sm alert-error-text">{directError}</p>
              )}
            </div>
          );
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
              className={
                p.popular
                  ? "relative rounded-3xl border border-gold/70 bg-gradient-to-b from-[#e8c55a] via-[#d4af37] to-[#b8962e] p-6 shadow-[0_24px_48px_-24px_rgba(212,175,55,0.55)]"
                  : "relative rounded-3xl border border-gold/20 bg-panel/60 p-6"
              }
            >
              {body}
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

      <CheckoutModal open={open} onClose={() => setOpen(false)} initialPackId={modalPack} />
    </div>
  );
}

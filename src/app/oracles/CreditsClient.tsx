"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { CREDIT_PACKS, apiPackId, perReadingPrice } from "@/lib/site";
import { getPurchaseHistory, type Purchase } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import CheckoutModal from "@/components/CheckoutModal";
import PurchaseConfirmer from "@/components/PurchaseConfirmer";
import Counter from "@/components/Counter";
import { useSearchParams } from "next/navigation";

interface ServerTx {
  id: string;
  pack_type: string;
  amount: number;
  readings: number;
  created_at: string;
}

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
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("dark");
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
  // Selected, not as a second pick.
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
      window.location.assign(data.url);
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
      <div className="mt-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          {reducedMotion ? (
            <p className="num text-6xl font-bold text-cream">
              {credits ?? 0}
              <span className="ml-2 align-middle font-body text-lg text-mist">
                {(credits ?? 0) === 1 ? "Oracle" : "Oracles"}
              </span>
            </p>
          ) : (
            <div className="flex items-baseline justify-center gap-2 sm:justify-start">
              <Counter
                value={credits ?? 0}
                textColor={siteTheme === "light" ? "#1c1a15" : "#ede6d6"}
                fontSize={56}
                fontWeight="bold"
              />
              <span className="font-body text-lg text-mist">
                {(credits ?? 0) === 1 ? "Oracle" : "Oracles"}
              </span>
            </div>
          )}
          {user && <p className="mt-1 text-sm text-mist">Signed in as {user.email}</p>}
        </div>
        <p className="max-w-md text-sm text-cream/75">
          1 Oracle = 1 full reading. Daily card free. Oracles never expire,
          no subscription. An Oracle opens a reading, not a prediction or promise.{" "}
          <Link href="/faq#what-are-the-five-oracle-rules" className="text-goldbright underline">
            See all five Oracle rules
          </Link>
        </p>
      </div>


      <p className="mt-6 text-center text-sm text-cream/75">
        Every pack works for tarot readings, birth charts, and reports.
      </p>

      <div className="mt-4 grid items-stretch gap-4 sm:grid-cols-3">

        {CREDIT_PACKS.map((p, i) => {
          // Centered cards, approved 2026-11-04: every card is
          // centered, like the React Bits showcase cards, not left
          // aligned. Phase 2, 2.5: the popular card used to be a gold
          // PixelCard with dark text, which made its gold Checkout
          // button sit on gold at 1.00:1. It is a dark panel with a
          // gold border now, so all cards use theme text and the gold
          // button has real contrast; the popular distinction stays
          // border, shadow, and badge.
          const nameClass = "text-cream";
          const priceColor =
            siteTheme === "light" ? "#7c5e00" : "#f4d03f";
          const body = (
            <div className="flex h-full flex-col text-center">
              <p className={`font-display text-xl ${nameClass}`}>{p.name}</p>
              {/* Fixed badge row on every card, so the price line
                  sits at the same height whether or not this card
                  carries the badge. The badge is the popular
                  distinction, not extra height. */}
              <div className="mt-1 flex h-6 items-center justify-center">
                {p.popular && (
                  <span className="inline-block rounded-full bg-[#14100a] px-3 py-1 text-xs font-bold text-[#f4d03f]">
                    Most popular
                  </span>
                )}
              </div>
              {/* Price is static text, not the rolling Counter.
                  The Counter intro spin renders digits mid-roll,
                  which is why screenshots showed scattered,
                  overlapping price digits. A price must read
                  correctly at any moment, in any capture, so it
                  keeps the display serif and size but does not
                  animate. The balance Counter above is unchanged. */}
              <p
                className="mt-3 font-display text-[40px] font-bold leading-none"
                style={{ color: priceColor }}
              >
                ${p.price.toFixed(2)}
              </p>
              <p className={`mt-2 text-base ${nameClass}`}>
                <span className="font-display text-xl">{p.readings}</span> Oracles · ${perReadingPrice(p)} per Oracle
              </p>


              {/* Audit 4: every pack uses the same solid btn-gold, same
                  padding, weight, and size. */}
              {/* Direct checkout, approved 2026-11-04: this button goes
                  straight to Lemon Squeezy for this card's pack.
                  The modal stays for spreads, header, and reading
                  flows, where no pack was picked yet, and for guests
                  here, where an email step is still needed. */}
              {/* mt-auto pins every Checkout button to the card
                  foot, so buttons align across cards even though
                  the popular card carries the badge row. */}
              <div className="mt-auto pt-4">
                <button
                  type="button"
                  disabled={directProcessing !== null}
                  onClick={() => void buyDirect(p.id)}
                  className="btn-gold w-full rounded-xl px-4 py-2.5 font-bold disabled:opacity-60"
                >
                  {directProcessing === p.id ? "…" : "Checkout"}
                </button>
              </div>
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
              className="relative h-full"
            >
              {/* Phase 2, 2.5: the popular card is a dark panel with a
                  gold border, not a gold PixelCard, so the gold
                  Checkout button has real contrast (7.81:1 in the
                  default dark theme). The popular distinction stays
                  border, shadow, and the badge, not a gold fill. */}
              <div
                className={`relative h-full rounded-3xl border p-4 ${
                  p.popular
                    ? "border-gold/70 bg-panel/80 shadow-[0_24px_48px_-24px_rgba(212,175,55,0.55)]"
                    : "border-gold/20 bg-panel/60"
                }`}
              >
                {body}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-gold/20 bg-panel/50 p-4">
        <p className="font-display text-xl text-goldbright">Purchase history</p>
        {user ? (
          serverTx === null ? (
            <p className="mt-2 text-sm text-mist">Loading…</p>
          ) : serverTx.length === 0 ? (
            <p className="mt-2 text-sm text-mist">No purchases yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {serverTx.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gold/15 bg-panel/40 px-3 py-2 text-sm"
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
            to keep receipts synced.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {localHistory.map((p, i) => (
              <li
                key={`${p.date}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-gold/15 bg-panel/40 px-3 py-2 text-sm"
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

      <p className="mx-auto mt-6 max-w-md text-center text-xs leading-relaxed text-mist">
        Pay-per-reading, no subscriptions. Prices are in US dollars
        (USD). The checkout shows the full amount, including any
        applicable taxes or fees; there are no hidden fees. Secure
        checkout is powered by Lemon Squeezy.
      </p>

      <CheckoutModal open={open} onClose={() => setOpen(false)} initialPackId={modalPack} />
    </div>
  );
}

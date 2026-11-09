"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPurchaseHistory, type Purchase } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
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

export default function CreditsPage() {
  const { credits, user, loading } = useAuth();
  const isGuest = !loading && !user;
  const searchParams = useSearchParams();
  const justPurchased = searchParams.get("purchase") === "success";
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
          {credits === null ? (
            // AF-013: balance unknown, so show a skeleton, never 0.
            <output
              className="flex items-baseline justify-center gap-2 sm:justify-start"
              aria-busy="true"
              aria-label="Oracle balance loading"
            >
              <span className="inline-block h-14 w-20 animate-pulse rounded bg-gold/30" aria-hidden="true" />
              <span className="font-body text-lg text-mist">Oracles</span>
            </output>
          ) : isGuest ? (
            // Guests have no balance to show; point to the free reading.
            <p className="font-body text-lg text-cream">
              <Link href="/spreads/quick-insight" className="text-goldbright underline">
                Ask your question
              </Link>
            </p>
          ) : reducedMotion ? (
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
          1 Oracle = 1 full reading. Oracles never expire,
          no subscription. An Oracle opens a reading, not a prediction or promise.{" "}
          <Link href="/faq#what-are-the-five-oracle-rules" className="text-goldbright underline">
            See all five Oracle rules
          </Link>
        </p>
      </div>


      <div className="mt-6 rounded-2xl border border-gold/20 bg-panel/50 p-4">
        <h2 className="font-display text-xl text-goldbright">Purchase history</h2>
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
        Secure checkout is powered by Lemon Squeezy. There are no hidden fees.
      </p>

      {/* Phase E (item 9): the same full sample reading as the home
          page, so visitors weighing a pack see exactly what a reading
          reads like before they spend anything. */}
      <SampleReading />
    </div>
  );
}

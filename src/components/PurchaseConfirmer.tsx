"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

/**
 * Shown on /credits?purchase=success right after Lemon Squeezy redirects back.
 * Polls the balance until the webhook's credits land (usually seconds), so
 * there is no waiting screen — the reveal is instant.
 */
export default function PurchaseConfirmer() {
  const { user, credits, refresh } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const baseline = useRef<number | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (baseline.current === null && credits !== null) {
      baseline.current = credits;
    }
    if (confirmed || timedOut) return;
    if (baseline.current !== null && credits !== null && credits > baseline.current) {
      setConfirmed(true);
      return;
    }
    if (attempts.current >= 10) {
      setTimedOut(true);
      return;
    }
    const t = setTimeout(() => {
      attempts.current += 1;
      void refresh();
    }, 2000);
    return () => clearTimeout(t);
  }, [credits, confirmed, timedOut, refresh]);

  if (confirmed) {
    return (
      <div className="mb-8 rounded-3xl border border-gold/50 bg-gold/10 p-6 text-center">
        <p className="font-display text-3xl text-goldbright">✦ Payment received</p>
        <p className="mt-2 text-sm text-cream/85">
          Your credits are in your balance ({credits}). Cast the lots whenever
          you are ready.
        </p>
        <Link
          href="/spreads"
          className="btn-gold mt-4 inline-block rounded-xl px-8 py-3 font-bold"
        >
          Begin a reading
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-3xl border border-gold/30 bg-panel/60 p-6 text-center" aria-live="polite">
      {timedOut ? (
        <>
          <p className="font-display text-2xl text-cream">Almost there</p>
          <p className="mt-2 text-sm text-cream/75">
            Your payment went through; the credits can take a minute to land.
            {user ? (
              <> They will appear in your balance shortly.</>
            ) : (
              <>
                {" "}If you checked out as a guest,{" "}
                <Link href="/account" className="text-goldbright underline">
                  sign in with your purchase email
                </Link>{" "}
                to see them.
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-2xl text-goldbright">Confirming your purchase…</p>
          <p className="mt-2 text-sm text-mist">
            Your credits are being added. This usually takes a few seconds.
          </p>
        </>
      )}
    </div>
  );
}

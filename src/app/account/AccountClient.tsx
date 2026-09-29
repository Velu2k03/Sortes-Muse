"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCredits } from "@/lib/storage";

/**
 * Account page. Phase 7 wires real auth (Clerk/NextAuth) + DB here:
 * email, credit balance synced from the database, purchase history.
 */
export default function AccountPage() {
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    setCredits(getCredits());
    const sync = () => setCredits(getCredits());
    window.addEventListener("sortes:credits-changed", sync);
    return () => window.removeEventListener("sortes:credits-changed", sync);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
        Account
      </p>
      <h1 className="mt-3 text-center font-display text-5xl text-goldbright">
        Your account
      </h1>

      <div className="mt-8 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-mist">
              Signed in as
            </p>
            <p className="mt-1 text-lg text-cream">Guest</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-mist">
              Credit balance
            </p>
            <p className="mt-1 font-display text-3xl text-goldbright">
              {credits}
            </p>
          </div>
        </div>
        <div className="rule-gold my-6" />
        <p className="text-sm leading-relaxed text-cream/75">
          Sign-in is coming soon. Your guest balance, daily cards, and journal
          live safely in this browser. When accounts launch, checkout will
          create yours automatically from your email, and everything will sync.
        </p>
        <Link
          href="/credits"
          className="btn-gold mt-6 inline-block rounded-xl px-6 py-3 font-bold"
        >
          Top up credits
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
        <p className="font-display text-2xl text-goldbright">Purchase history</p>
        <p className="mt-2 text-sm text-mist">
          No purchases yet. Every transaction (email, pack type, amount, date)
          will be listed here once checkout is connected.
        </p>
      </div>
    </div>
  );
}

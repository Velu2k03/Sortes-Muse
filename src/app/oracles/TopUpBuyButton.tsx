"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

// Phase 2 batch 3: direct checkout for one top-up card. Top-ups
// are an account feature (the subscription checkout route requires
// sign-in), so a guest is sent to the account page — the sign-in
// entry point — instead of a guest email step. Signed-in visitors
// go straight to Lemon Squeezy.
export default function TopUpBuyButton({
  topUpId,
  label,
}: {
  topUpId: "topup-1000" | "topup-3000";
  label: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = async () => {
    setError(null);
    if (!user) {
      router.push("/account");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "topup", key: topUpId }),
      });
      const data = await res.json().catch(() => ({}));
      const unavailable = "Checkout is temporarily unavailable. Please try again in a moment.";
      if (res.status === 401) {
        router.push("/account");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? unavailable);
      if (!data.url) throw new Error(unavailable);
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={processing}
        onClick={() => void buy()}
        className="btn-gold w-full rounded-xl px-4 py-3 font-bold lining-nums tabular-nums disabled:opacity-100 disabled:saturate-50"
      >
        {processing ? "…" : label}
      </button>
      {error && <p className="mt-2 text-sm alert-error-text">{error}</p>}
    </>
  );
}

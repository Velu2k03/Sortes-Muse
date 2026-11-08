"use client";

import { useState } from "react";
import { apiPackId } from "@/lib/site";
import { useAuth } from "@/components/AuthProvider";
import CheckoutModal from "@/components/CheckoutModal";

// Direct checkout for one pack card (approved 2026-11-04). Signed-in
// visitors go straight to Lemon Squeezy; guests get the modal as the
// email step only, with their pack preselected.
export default function PackBuyButton({
  packId,
  label,
}: {
  packId: string;
  label: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = async () => {
    setError(null);
    if (!user) {
      setOpen(true);
      return;
    }
    setProcessing(true);
    try {
      const enabledRes = await fetch("/api/checkout/lemonsqueezy");
      const enabledData = await enabledRes.json().catch(() => ({}));
      if (!enabledData.enabled) {
        setOpen(true);
        return;
      }
      const res = await fetch("/api/checkout/lemonsqueezy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: apiPackId(packId) }),
      });
      const data = await res.json().catch(() => ({}));
      // Brutal audit F1: an empty or non-JSON body reads as a clear
      // "temporarily unavailable", not a bare "Checkout failed."
      const unavailable = "Checkout is temporarily unavailable. Please try again in a moment.";
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
      <CheckoutModal open={open} onClose={() => setOpen(false)} initialPackId={packId} />
    </>
  );
}

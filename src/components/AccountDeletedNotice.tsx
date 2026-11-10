"use client";

import { useEffect, useState } from "react";

/**
 * Point 9: after account deletion signOut sends the seeker to /?account=deleted
 * (a full navigation, so no in-memory state survives). This shows the
 * confirmation there, once, and strips the param so a reload is clean.
 */
export default function AccountDeletedNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("account") !== "deleted") return;
    url.searchParams.delete("account");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    queueMicrotask(() => setShow(true));
  }, []);
  if (!show) return null;
  return (
    <output className="mx-auto mt-6 block max-w-2xl rounded-2xl border border-gold/30 bg-panel/80 px-4 py-5 text-center sm:px-6">
      <span className="block font-display text-2xl text-goldbright">Your account is deleted</span>
      <span className="mx-auto mt-2 block max-w-md leading-relaxed text-cream/75">
        Your account, Oracles, journal, reports, and purchase history are gone,
        including the copies on this device. Thank you for casting the lots with us.
      </span>
      <button type="button" onClick={() => setShow(false)} className="btn-ghost mt-4 rounded-xl px-6 py-2.5 font-semibold">
        Dismiss
      </button>
    </output>
  );
}

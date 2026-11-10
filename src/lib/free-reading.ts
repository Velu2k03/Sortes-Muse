// Batch 1 (C1): one place that decides whether the first Quick Insight
// is free, so every label reads from the same rule the generate route
// spends from. Signed-in users are decided by the server record (the
// account's free_readings row); guests have no account, so the device
// flag is their record. While the server value is unknown for a signed-in
// user (auth still loading, /me failed), never promise "Free": the label
// fails closed, and the server still grants the free use at generation
// time, so nobody is overcharged by the display.
//
// Opus review (B1) and re-check: a prior session with no current user
// always means the auth state is unknown, not signed out. A failed /me
// (429, 5xx, network drop) leaves user null WITHOUT setting loadError,
// so the device flag must never be trusted in that state either. The
// session key is removed on sign-out and on a confirmed {user:null}
// expiry, so hadSession with no user is exactly the unknown state.
// A failed /me on a fresh device (no session key yet) is covered by
// authFailed instead.
export function isFreeAvailableFor(opts: {
  slug: string;
  signedIn: boolean;
  /** Account record from /api/auth/me; null while unknown. */
  serverFree: boolean | null;
  /** Device flag from freeReadingUsed(); guests only. */
  deviceFree: boolean;
  /** This device held a signed-in session before. */
  hadSession?: boolean;
  /** The last /api/auth/me call failed (non-OK or network error). */
  authFailed?: boolean;
}): boolean {
  if (opts.slug !== "quick-insight") return false;
  if (opts.signedIn) return opts.serverFree === true;
  if (opts.hadSession || opts.authFailed) return false;
  return opts.deviceFree;
}

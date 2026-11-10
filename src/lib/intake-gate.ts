/**
 * Batch D (A3): when does the intake flow show the sign-in gate instead of
 * its steps? Generation needs an account unless it is a guest's free Quick
 * Insight, so the gate shows BEFORE the category and story steps. While the
 * session is loading we wait, so a signed-in seeker never sees it flash.
 * A server 401 (a free use the server already counted, an expired session)
 * turns it on for a guest even when the device thought the free use was open.
 */
export function intakeGate(opts: {
  signedIn: boolean;
  isFreeAvailable: boolean;
  authLoading: boolean;
  serverSignInNeeded: boolean;
}): "loading" | "signin" | null {
  const { signedIn, isFreeAvailable, authLoading, serverSignInNeeded } = opts;
  if (signedIn) return null;
  if (isFreeAvailable) return serverSignInNeeded ? "signin" : null;
  return authLoading ? "loading" : "signin";
}

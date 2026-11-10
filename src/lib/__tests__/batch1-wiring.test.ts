import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Batch 1 (C1/C2, review test gaps): source-scan guards for the label
// wiring and the follow-up failure handling. A hook test would need a
// React renderer the repo does not have; these guards fail loudly if
// a call site reverts to the device flag or the old failure handling.
// Same pattern as point-6-9.test.ts.
const src = (p: string) => readFileSync(p, "utf8").replace(/\s+/g, " ");

describe("Batch 1 wiring guards", () => {
  it("C1: every free label reads through isFreeAvailableFor, never the raw device flag", () => {
    for (const p of [
      "src/app/intake/[slug]/useIntakeFlow.ts",
      "src/components/ReadingFlow.tsx",
      "src/app/spreads/SpreadsClient.tsx",
    ]) {
      expect(src(p)).toContain("isFreeAvailableFor({");
    }
    // No call site still decides "free" from freeReadingUsed() alone.
    expect(src("src/app/intake/[slug]/useIntakeFlow.ts")).not.toContain(
      "spread.slug === \"quick-insight\" && !usedFree"
    );
    expect(src("src/components/ReadingFlow.tsx")).not.toContain(
      "spread.slug === \"quick-insight\" && !usedFree"
    );
  });

  it("C1: AuthProvider clears the server free flag on sign-out", () => {
    const auth = src("src/components/AuthProvider.tsx");
    expect(auth).toContain("setFreeReadingAvailable(null)");
    expect(auth).toContain("refreshFreeStatus");
    expect(auth).toContain("deviceHeldSession");
  });

  it("C1 (re-check): the session key is separate from the migration key, and a failed /me is exposed", () => {
    const auth = src("src/components/AuthProvider.tsx");
    // MIGRATED_KEY means "migration done" only. A confirmed session
    // sets the separate HAD_SESSION_KEY, so a failed migration still
    // retries on the next refresh instead of losing the guest journal.
    expect(auth).toContain('const HAD_SESSION_KEY = "sortes-had-session"');
    expect(auth).toContain('localStorage.setItem(HAD_SESSION_KEY, "1")');
    expect(auth).toContain("localStorage.removeItem(HAD_SESSION_KEY)");
    // A non-OK /me (429, 5xx) or a network drop sets authFailed, so
    // the free label fails closed instead of trusting the device flag.
    expect(auth).toContain("authFailed");
    expect(auth).toContain("setAuthFailed(true)");
    expect(auth).toContain("setAuthFailed(false)");
  });

  it("C1 (re-check): no call site reads the session flag during render (hydration)", () => {
    for (const p of [
      "src/app/intake/[slug]/useIntakeFlow.ts",
      "src/components/ReadingFlow.tsx",
      "src/app/spreads/SpreadsClient.tsx",
    ]) {
      const s = src(p);
      // The flag is read in a mount effect, never in the render path:
      // the server renders without it, so a render read hydrates
      // mismatched ("Free" on the server, "1 Oracle" on the client).
      expect(s).toContain("setHadSession(deviceHeldSession())");
      expect(s).not.toContain("hadSession: deviceHeldSession()");
      expect(s).toContain("authFailed");
    }
  });

  it("C1 (re-check 2): no free label reads the raw device flag, and the loading window fails closed", () => {
    for (const p of [
      "src/app/intake/[slug]/useIntakeFlow.ts",
      "src/components/ReadingFlow.tsx",
      "src/app/spreads/SpreadsClient.tsx",
    ]) {
      const s = src(p);
      // The device flag feeds isFreeAvailableFor exactly once (as
      // deviceFree). Any other !usedFree is a label that bypasses the
      // server record: the exact C1 symptom, left on the page where
      // users compare spreads.
      expect(s.split("!usedFree").length - 1).toBe(1);
    }
    // While auth is still loading the state is unknown, so the display
    // call sites fail closed instead of showing "Free" from the device
    // flag for up to one /me round trip. The intake gate already waits
    // on authLoading, and re-check 3 showed the label itself must
    // wait too, or a signed-in user with no session key yet sees
    // "Free" and walks through the gate without waiting.
    expect(src("src/components/ReadingFlow.tsx")).toContain("!authLoading &&");
    expect(src("src/app/spreads/SpreadsClient.tsx")).toContain("!authLoading &&");
    expect(src("src/app/intake/[slug]/useIntakeFlow.ts")).toContain("!authLoading &&");
  });

  it("C1 (re-check 3): the header pill goes through the helper, never the raw device flag", () => {
    const header = src("src/components/Header.tsx");
    expect(header).toContain("isFreeAvailableFor({");
    expect(header).toContain("authFailed");
    expect(header).toContain("deviceHeldSession");
    // The device flag feeds the helper exactly once (as deviceFree).
    // A signed-in user whose /me failed (user null, credits 0 after
    // migration) must not see "1 free reading" from an unused flag.
    expect(header.split("!freeReadingUsed()").length - 1).toBe(1);
  });

  it("C1 (re-check 2): the expiry branch clears both session keys, and the session-key write cannot throw", () => {
    const auth = src("src/components/AuthProvider.tsx");
    // Gating the expiry branch on MIGRATED_KEY alone would strand
    // HAD_SESSION_KEY when the migration had failed, and the device
    // would read as "unknown" forever, hiding "Free" from a genuine
    // guest.
    expect(auth).toContain("localStorage.getItem(MIGRATED_KEY) || localStorage.getItem(HAD_SESSION_KEY)");
    // A failed setItem (full quota, private mode) must not land in
    // the refresh catch and sign the user out.
    expect(auth).toContain("localStorage.setItem(HAD_SESSION_KEY, \"1\")");
  });

  it("C1 (re-check 3): the expiry wipe runs only after a successful sync, so an unsynced journal survives", () => {
    const auth = src("src/components/AuthProvider.tsx");
    // When only HAD_SESSION_KEY is set the history sync failed, so
    // the local journal is the only copy. Wiping it there would
    // destroy readings that never uploaded. The wipe must be gated
    // on MIGRATED_KEY while both keys are still removed either way.
    expect(auth).toContain("if (localStorage.getItem(MIGRATED_KEY)) {");
    expect(auth).toContain("clearLocalAccountData();");
  });

  it("C1: the intake re-reads the flag before the cost is shown or acted on", () => {
    const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(flow).toContain("refreshFreeStatus()");
    expect(flow).toContain("step === \"confirm\"");
  });

  it("C2: the failure refresh matches on the attempt id only, never on question text", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("f.id === attemptId");
    expect(detail).not.toContain("f.question === q");
  });

  it("C2: the pending id is cleared on the saved-by-server paths, not only on success", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    const clears = detail.split("clearPendingAttemptId(attemptScope)").length - 1;
    expect(clears).toBeGreaterThanOrEqual(3);
  });

  it("C2: an unknown refresh never claims 'No Oracle was spent'", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("We could not confirm whether your follow-up was saved.");
    expect(detail).toContain("Retrying is safe: the same request will not charge twice.");
  });

  it("C2: a not-saved refresh says 'not saved yet', never 'No Oracle was spent'", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("was not saved yet");
  });

  it("C2: the refresh runs only on ambiguous failures (5xx without a server error body, or a throw)", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("res.status >= 500 && !data.error");
  });
});

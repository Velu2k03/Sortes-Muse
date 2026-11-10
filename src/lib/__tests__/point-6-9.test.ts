import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import {
  getIntakeDraft, saveIntakeDraft, INTAKE_DRAFT_TTL_MS,
  safeReturnTo, stashReturnTo, takeReturnTo, clearLocalAccountData,
} from "@/lib/storage";
import { postFollowUp } from "@/lib/follow-up-client";
import type { Reading } from "@/lib/types";

const src = (p: string) => readFileSync(p, "utf8").replace(/\s+/g, " ");
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  g.window = globalThis;
});
afterEach(() => {
  vi.useRealTimers();
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.localStorage;
  delete g.window;
});

const draft = { slug: "celtic-cross", categoryKey: "health", answers: {}, story: "private story", question: "q?" };

describe("Point 6: draft expiry", () => {
  it("a fresh draft restores", () => {
    saveIntakeDraft(draft);
    expect(getIntakeDraft("celtic-cross")?.story).toBe("private story");
  });
  it("a draft older than the expiry is ignored AND cleared from storage", () => {
    vi.useFakeTimers();
    saveIntakeDraft(draft);
    vi.setSystemTime(Date.now() + INTAKE_DRAFT_TTL_MS + 1000);
    expect(getIntakeDraft("celtic-cross")).toBeNull();
    expect(store.has("sortes-intake-draft")).toBe(false);
  });
  it("a draft with no timestamp (older build) counts as expired", () => {
    store.set("sortes-intake-draft", JSON.stringify(draft));
    expect(getIntakeDraft("celtic-cross")).toBeNull();
    expect(store.has("sortes-intake-draft")).toBe(false);
  });
  it("the expiry is hours, not days", () => {
    expect(INTAKE_DRAFT_TTL_MS).toBeGreaterThanOrEqual(3600_000);
    expect(INTAKE_DRAFT_TTL_MS).toBeLessThanOrEqual(12 * 3600_000);
  });
});

describe("Point 6: Start over", () => {
  it("is a visible button on the form step wired to startOver, which clears the draft and form", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("onClick={f.startOver}");
    expect(steps).toContain("Start over");
    const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");
    const body = flow.slice(flow.indexOf("const startOver"), flow.indexOf("const questionSuggestion"));
    for (const call of ["clearIntakeDraft()", "setCategoryKey(null)", "setAnswers({})", 'setStory("")', 'setQuestion("")', 'setStep("category")']) {
      expect(body).toContain(call);
    }
  });
});

describe("Point 6: return URL", () => {
  it("the sign-in gate links to /account with the spread as returnTo", () => {
    expect(src("src/app/intake/[slug]/IntakeSteps.tsx")).toContain(
      "href={`/account?returnTo=${encodeURIComponent(`/intake/${spread.slug}`)}`}"
    );
  });
  it("only same-site paths are accepted", () => {
    expect(safeReturnTo("/intake/celtic-cross")).toBe("/intake/celtic-cross");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "intake/x", "", null, undefined]) {
      expect(safeReturnTo(bad as string | null)).toBeNull();
    }
  });
  it("stash survives the OAuth/email-link round trip, is consumed once, and expires after an hour", () => {
    stashReturnTo("/intake/celtic-cross");
    expect(takeReturnTo()).toBe("/intake/celtic-cross");
    expect(takeReturnTo()).toBeNull();
    vi.useFakeTimers();
    stashReturnTo("/intake/celtic-cross");
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect(takeReturnTo()).toBeNull();
  });
  it("sign-out wipes a stashed return path", () => {
    stashReturnTo("/intake/celtic-cross");
    clearLocalAccountData();
    expect(takeReturnTo()).toBeNull();
  });
  it("the account page redirects to the stashed path once signed in (code path)", () => {
    const acct = src("src/app/account/AccountClient.tsx");
    expect(acct).toContain("useReturnTo(!!user)");
    expect(acct).toContain("if (!signedIn) return; const dest = takeReturnTo(); if (dest) router.replace(dest);");
  });
});

describe("Point 9: account-deleted destination", () => {
  it("deleteAccount signs out to /?account=deleted and signOut navigates to the destination", () => {
    expect(src("src/app/account/useAccountSettings.ts")).toContain('await signOut("/?account=deleted")');
    const auth = src("src/components/AuthProvider.tsx");
    expect(auth).toContain('async (to: string = "/") =>');
    expect(auth).toContain("window.location.assign(to)");
  });
  it("the home page mounts the notice, which shows the confirmation for ?account=deleted", () => {
    expect(src("src/app/page.tsx")).toContain("<AccountDeletedNotice />");
    const n = src("src/components/AccountDeletedNotice.tsx");
    expect(n).toContain('get("account") !== "deleted"');
    expect(n).toContain("Your account is deleted");
  });
});

describe("Point 9: follow-up re-sync and single retry", () => {
  const reading = { id: "r1" } as Reading;
  const json = (status: number, body: object) => new Response(JSON.stringify(body), { status });

  it("404, sync ok, retry succeeds: returns the follow-up", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json(404, { error: "Reading not found." }))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(200, { followUps: [{ q: "a" }] }));
    const { res, data } = await postFollowUp(reading, "why?", f as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    expect(data.followUps).toBeTruthy();
    expect(f.mock.calls.map((c) => c[0])).toEqual(["/api/reading/follow-up", "/api/history", "/api/reading/follow-up"]);
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ readings: [reading] });
  });
  it("404 again after the sync: error shown, no third attempt", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json(404, { error: "Reading not found." }))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(404, { error: "Reading not found." }));
    const { res, data } = await postFollowUp(reading, "why?", f as unknown as typeof fetch);
    expect(res.status).toBe(404);
    expect(data.error).toBe("Reading not found.");
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("sync itself fails: returns the original 404 without retrying", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json(404, { error: "Reading not found." }))
      .mockResolvedValueOnce(json(500, {}));
    const { res } = await postFollowUp(reading, "why?", f as unknown as typeof fetch);
    expect(res.status).toBe(404);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("non-404 errors (402) are not re-synced", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(402, { error: "Not enough Oracles." }));
    const { res } = await postFollowUp(reading, "why?", f as unknown as typeof fetch);
    expect(res.status).toBe(402);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("useFollowUp uses postFollowUp", () => {
    expect(src("src/app/reading/[id]/useReadingDetail.ts")).toContain("await postFollowUp(reading, q)");
  });
});

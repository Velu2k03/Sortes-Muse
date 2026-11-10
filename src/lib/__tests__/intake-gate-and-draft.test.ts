import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { intakeGate } from "@/lib/intake-gate";
import {
  getIntakeDraft,
  saveIntakeDraft,
  clearIntakeDraft,
  clearLocalAccountData,
} from "@/lib/storage";

// Batch D (A3). The gate decision and the draft storage are pure/testable;
// the hook wiring (useIntakeFlow renders <SignInGate> from intakeGate, and
// restores/saves/clears the draft) is covered by code inspection because the
// repo has no component-test harness (no jsdom / testing-library).
describe("intakeGate", () => {
  const base = { signedIn: false, isFreeAvailable: false, authLoading: false, serverSignInNeeded: false };

  it("guest on a paid spread (free not available): gate shows before the story form", () => {
    expect(intakeGate(base)).toBe("signin");
  });
  it("waits while the session loads, never flashing the gate for a signed-in seeker", () => {
    expect(intakeGate({ ...base, authLoading: true })).toBe("loading");
    expect(intakeGate({ ...base, signedIn: true, authLoading: true })).toBeNull();
  });
  it("signed-in: no gate, on any spread", () => {
    expect(intakeGate({ ...base, signedIn: true })).toBeNull();
  });
  it("guest's free Quick Insight: no gate, so the free path still works without sign-in", () => {
    expect(intakeGate({ ...base, isFreeAvailable: true })).toBeNull();
  });
  it("guest whose free use the server already counted (401): gate turns on", () => {
    expect(intakeGate({ ...base, isFreeAvailable: true, serverSignInNeeded: true })).toBe("signin");
  });
});

describe("intake draft storage", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    const stub = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const g = globalThis as unknown as Record<string, unknown>;
    g.localStorage = stub;
    g.window = globalThis;
  });
  afterEach(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.localStorage;
    delete g.window;
  });

  const draft = { slug: "celtic-cross", categoryKey: "love", answers: { yourName: "Asha" }, story: "My story", question: "What now?" };

  it("round-trips a draft across a navigation (save, then restore for the same spread)", () => {
    saveIntakeDraft(draft);
    expect(getIntakeDraft("celtic-cross")).toEqual(draft);
  });
  it("does not restore a draft written for a different spread", () => {
    saveIntakeDraft(draft);
    expect(getIntakeDraft("quick-insight")).toBeNull();
  });
  it("clears after a successful generation", () => {
    saveIntakeDraft(draft);
    clearIntakeDraft();
    expect(getIntakeDraft("celtic-cross")).toBeNull();
  });
  it("is wiped on sign-out with the rest of the account's local data", () => {
    saveIntakeDraft(draft);
    clearLocalAccountData();
    expect(getIntakeDraft("celtic-cross")).toBeNull();
  });
  it("tolerates a corrupt draft", () => {
    store.set("sortes-intake-draft", "{not json");
    expect(getIntakeDraft("celtic-cross")).toBeNull();
  });
});

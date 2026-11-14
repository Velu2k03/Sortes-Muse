import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setHeroQuestion,
  takeHeroQuestion,
  peekHeroQuestion,
  clearLocalAccountData,
} from "@/lib/storage";

// Remodel hero question handoff (Velu, 2026-11-14): the question
// typed in the hero box travels to the intake in localStorage, not
// sessionStorage (an email-link sign-in opens a new tab, and the
// return destination already survives through localStorage). One-time
// read with a 1-hour expiry. storage.ts guards on window, and vitest
// runs in node, so stub a minimal window + localStorage to exercise
// the round trip. The stubs are per-file (vitest isolates test files)
// and un-stubbed after each test.
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

describe("hero question handoff (localStorage)", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("localStorage", localStorageMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a question and reads it only once", () => {
    setHeroQuestion("What should I focus on today?");
    expect(peekHeroQuestion()).toBe("What should I focus on today?");
    expect(takeHeroQuestion()).toBe("What should I focus on today?");
    expect(takeHeroQuestion()).toBeNull();
    expect(peekHeroQuestion()).toBeNull();
  });

  it("an empty submit clears a stale pending question", () => {
    setHeroQuestion("What should I focus on today?");
    setHeroQuestion("");
    expect(takeHeroQuestion()).toBeNull();
  });

  it("a whitespace-only question reads as null", () => {
    setHeroQuestion("   ");
    expect(takeHeroQuestion()).toBeNull();
  });

  it("an expired question never prefills", () => {
    // Written raw, with a timestamp from the epoch: past the 1-hour TTL.
    store.set(
      "sortes-hero-question",
      JSON.stringify({ q: "What should I focus on today?", at: 0 })
    );
    expect(peekHeroQuestion()).toBeNull();
    expect(takeHeroQuestion()).toBeNull();
    expect(store.has("sortes-hero-question")).toBe(false);
  });

  it("an empty store reads as null", () => {
    expect(takeHeroQuestion()).toBeNull();
    expect(peekHeroQuestion()).toBeNull();
  });

  it("sign-out clears a pending question", () => {
    setHeroQuestion("What should I focus on today?");
    clearLocalAccountData();
    expect(takeHeroQuestion()).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setHeroQuestion,
  takeHeroQuestion,
  peekHeroQuestion,
} from "@/lib/storage";

// Remodel hero question handoff (Velu, 2026-11-14): the question
// typed in the hero box travels to the intake in sessionStorage.
// storage.ts guards on window, and vitest runs in node, so stub a
// minimal window + sessionStorage to exercise the round trip. The
// stubs are per-file (vitest isolates test files) and un-stubbed
// after each test.
const store = new Map<string, string>();
const sessionStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

describe("hero question handoff (sessionStorage)", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("sessionStorage", sessionStorageMock);
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

  it("a whitespace-only question reads as null", () => {
    setHeroQuestion("   ");
    expect(takeHeroQuestion()).toBeNull();
  });

  it("an empty store reads as null", () => {
    expect(takeHeroQuestion()).toBeNull();
    expect(peekHeroQuestion()).toBeNull();
  });
});

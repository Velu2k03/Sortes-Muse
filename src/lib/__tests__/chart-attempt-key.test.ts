import { afterEach, describe, expect, it, vi } from "vitest";
import { chartAttemptKey } from "@/lib/chart-submit";
import { pendingAttemptId } from "@/lib/storage";

const fp = "1990-05-01|08:30|false|female|14.6|121|";

describe("chart interpret attempt id", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  afterEach(() => {
    vi.useRealTimers();
    delete g.window;
    delete g.localStorage;
  });

  it("is the same on both sides of UTC midnight for the same inputs", () => {
    g.window = globalThis;
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T23:59:00Z"));
    const before = pendingAttemptId("chart-interpret", chartAttemptKey("vedic", fp, "career", "q"));
    vi.setSystemTime(new Date("2026-11-10T00:01:00Z"));
    const after = pendingAttemptId("chart-interpret", chartAttemptKey("vedic", fp, "career", "q"));
    expect(after).toBe(before);
    vi.unstubAllGlobals();
  });

  it("changes when system, category or question changes", () => {
    const base = chartAttemptKey("vedic", fp, "career", "q");
    expect(chartAttemptKey("western", fp, "career", "q")).not.toBe(base);
    expect(chartAttemptKey("vedic", fp, "love", "q")).not.toBe(base);
    expect(chartAttemptKey("vedic", fp, "career", "r")).not.toBe(base);
    expect(chartAttemptKey("vedic", fp + "x", "career", "q")).not.toBe(base);
  });
});

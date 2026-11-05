import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveReport,
  getReports,
  saveReading,
  getHistory,
  setCredits,
  getCredits,
  setDailyCard,
  getDailyCard,
  clearLocalAccountData,
} from "@/lib/storage";
import type { SavedReport } from "@/lib/reports";
import type { Reading } from "@/lib/types";

// Phase 3 (3.5): the guest retry-save button must be harmless —
// saving the same report twice stores it once, matching the server
// branch (ON CONFLICT DO NOTHING). storage.ts only touches
// window/localStorage inside its functions, so stubs installed here
// take effect before any call.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  (globalThis as unknown as Record<string, unknown>).localStorage = stub;
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
}

function report(id: string): SavedReport {
  return {
    id,
    type: "transit",
    title: `Transit report for ${id}`,
    targetLabel: id,
    createdAt: "2026-11-05T00:00:00.000Z",
    data: { kind: "transit" } as unknown as SavedReport["data"],
    interpretation: "Sample interpretation.",
  };
}

describe("saveReport idempotency", () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
    delete (globalThis as unknown as Record<string, unknown>).window;
  });

  it("stores the same report id once, no matter how often it is saved", () => {
    saveReport(report("r1"));
    saveReport(report("r1"));
    expect(getReports()).toHaveLength(1);
    expect(getReports()[0].id).toBe("r1");
  });

  it("still stores distinct reports", () => {
    saveReport(report("r1"));
    saveReport(report("r2"));
    expect(getReports().map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });
});

describe("clearLocalAccountData", () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
    delete (globalThis as unknown as Record<string, unknown>).window;
  });

  it("clears journal, reports, and Oracle balance but keeps the daily card", () => {
    saveReading({ id: "h1", spreadName: "Quick Insight" } as unknown as Reading);
    saveReport(report("r1"));
    setCredits(5);
    setDailyCard("major-00", false);
    expect(getHistory()).toHaveLength(1);
    expect(getDailyCard()).not.toBeNull();

    clearLocalAccountData();

    expect(getHistory()).toHaveLength(0);
    expect(getReports()).toHaveLength(0);
    expect(getCredits()).toBe(0);
    expect(getDailyCard()).not.toBeNull();
  });
});

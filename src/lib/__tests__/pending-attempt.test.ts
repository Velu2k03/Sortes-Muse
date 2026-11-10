import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import {
  pendingAttemptId, clearPendingAttemptId, clearLocalAccountData, INTAKE_DRAFT_TTL_MS,
} from "@/lib/storage";
import { isUuid } from "@/lib/ids";

// Round 3 item 4: the pending reading/report id must survive a page reload,
// so a retry after a lost response replays the saved row instead of spending
// again. A "reload" here is: keep localStorage, throw away everything in
// memory (the helper keeps no module state, so calling it again IS a reload).
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

describe("pendingAttemptId", () => {
  it("returns a UUID and the same id on every call with the same inputs (retry and reload)", () => {
    const a = pendingAttemptId("intake:celtic-cross", "story|question");
    expect(isUuid(a)).toBe(true);
    expect(pendingAttemptId("intake:celtic-cross", "story|question")).toBe(a);
  });

  it("simulated reload between server commit and retry: the stored id is reused, so the server replays", () => {
    const first = pendingAttemptId("report", '{"type":"transit"}');
    // ...server commits and spends, the response is lost, the tab reloads...
    const afterReload = pendingAttemptId("report", '{"type":"transit"}');
    expect(afterReload).toBe(first);
  });

  it("changed inputs mint a new id; scopes are independent", () => {
    const a = pendingAttemptId("chart-interpret", "chart A");
    expect(pendingAttemptId("chart-interpret", "chart B")).not.toBe(a);
    const r = pendingAttemptId("report", "chart A");
    expect(r).not.toBe(pendingAttemptId("chart-interpret", "chart B"));
  });

  it("is cleared only by clearPendingAttemptId (the success response), and only for that scope", () => {
    const a = pendingAttemptId("intake:x", "s");
    const b = pendingAttemptId("report", "s");
    clearPendingAttemptId("intake:x");
    expect(pendingAttemptId("intake:x", "s")).not.toBe(a);
    expect(pendingAttemptId("report", "s")).toBe(b);
  });

  it("expires with the draft TTL, and sign-out wipes it", () => {
    vi.useFakeTimers();
    const a = pendingAttemptId("report", "s");
    vi.setSystemTime(Date.now() + INTAKE_DRAFT_TTL_MS + 1000);
    const b = pendingAttemptId("report", "s");
    expect(b).not.toBe(a);
    clearLocalAccountData();
    expect(pendingAttemptId("report", "s")).not.toBe(b);
  });

  it("never stores the raw inputs (birth details) in localStorage", () => {
    pendingAttemptId("report", '{"birth":{"date":"1990-04-05","place":"Manila"}}');
    const raw = [...store.values()].join("");
    expect(raw).not.toContain("1990-04-05");
    expect(raw).not.toContain("Manila");
  });
});

describe("the three clients use the persisted id and clear it only on success", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it.each([
    ["src/app/intake/[slug]/useIntakeFlow.ts", "intake:"],
    ["src/app/charts/useChartsClient.ts", "chart-interpret"],
    ["src/app/reports/ReportsClient.tsx", '"report"'],
  ])("%s", (file, scope) => {
    const s = src(file);
    expect(s).toContain("pendingAttemptId(");
    expect(s).toContain("clearPendingAttemptId(");
    expect(s).toContain(scope);
    // No in-memory-only id minting left behind.
    expect(s).not.toMatch(/\bnewId\(\)/);
  });
});

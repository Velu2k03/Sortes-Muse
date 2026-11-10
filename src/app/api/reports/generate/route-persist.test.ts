import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ getUserById: vi.fn(), saveReportWithSpend: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
// Output validation has its own tests; here the model text is accepted so
// the route reaches the persist step.
vi.mock("@/lib/output-validation", async (orig) => ({
  ...(await orig<typeof import("@/lib/output-validation")>()),
  validateReportText: () => true,
}));

import { POST } from "@/app/api/reports/generate/route";
import { getUserById, saveReportWithSpend } from "@/lib/db";
import { getSession } from "@/lib/auth";

const BIRTH = { date: "1990-05-01", hour: 12, minute: 0, latitude: 14.6, longitude: 121, gender: "female" };

function req(ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ type: "transit", birth: BIRTH, targetDate: "2026-11-05" }),
  });
}

// Batch D (B4): the report row is written with the spend, and the response
// carries the saved report (server id), so the client save is a no-op.
describe("POST /api/reports/generate — persists with the spend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "a@b.co" });
    vi.mocked(getUserById).mockResolvedValue({ id: "u1", email: "a@b.co", credits: 2, created_at: "2026-11-05T00:00:00Z" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "A report body." } }], model: "test/model:free" }),
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("saves the report through saveReportWithSpend and returns the same id", async () => {
    vi.mocked(saveReportWithSpend).mockResolvedValue({ ok: true });
    const res = await POST(req("10.4.0.1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(saveReportWithSpend).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(saveReportWithSpend).mock.calls[0];
    expect(saved[0]).toBe("u1");
    expect(saved[1].id).toBe(data.report.id);
    expect(saved[1].interpretation).toBe(data.report.interpretation);
  });

  it("returns 402 and no report when the transaction finds no credit", async () => {
    vi.mocked(saveReportWithSpend).mockResolvedValue({ ok: false });
    const res = await POST(req("10.4.0.2"));
    expect(res.status).toBe(402);
    expect((await res.json()).report).toBeUndefined();
  });
});

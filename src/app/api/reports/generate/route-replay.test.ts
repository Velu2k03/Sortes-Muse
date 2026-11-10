import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ getUserById: vi.fn(), saveReportWithSpend: vi.fn(), getReportForUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/output-validation", async (orig) => ({
  ...(await orig<typeof import("@/lib/output-validation")>()),
  validateReportText: () => true,
}));

import { POST } from "@/app/api/reports/generate/route";
import { getReportForUser, getUserById, saveReportWithSpend } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ID = "7a1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const BIRTH = { date: "1990-05-01", hour: 12, minute: 0, latitude: 14.6, longitude: 121, gender: "female" };
function req(reportId: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ type: "transit", birth: BIRTH, targetDate: "2026-11-05", reportId }),
  });
}

// Point 1: a retry with the same reportId after a committed save is a replay.
describe("POST /api/reports/generate — idempotent reportId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "a@b.co" });
    vi.mocked(getUserById).mockResolvedValue({ id: "u1", email: "a@b.co", credits: 2, created_at: "x" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "A report body." } }], model: "t/m:free" }),
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("rejects a non-UUID reportId with 400", async () => {
    expect((await POST(req("nope", "10.8.0.1"))).status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns the saved report with no model call and no spend", async () => {
    const prior = { id: ID, interpretation: "saved report" };
    vi.mocked(getReportForUser).mockResolvedValue(prior);
    const res = await POST(req(ID, "10.8.0.2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.report).toEqual(prior);
    expect(data.credits).toBe(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(saveReportWithSpend).not.toHaveBeenCalled();
  });

  it("saves under the client id on a first attempt, and serves the saved row if it lost a race", async () => {
    vi.mocked(getReportForUser).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: ID, interpretation: "winner" });
    vi.mocked(saveReportWithSpend).mockResolvedValue({ ok: true, existing: true });
    const res = await POST(req(ID, "10.8.0.3"));
    expect(vi.mocked(saveReportWithSpend).mock.calls[0][1].id).toBe(ID);
    expect((await res.json()).report.interpretation).toBe("winner");
  });

  it("returns 409 (not 402/500) when the id belongs to another user", async () => {
    vi.mocked(getReportForUser).mockResolvedValue(null);
    vi.mocked(saveReportWithSpend).mockResolvedValue({ ok: false, conflict: true });
    const res = await POST(req(ID, "10.8.0.4"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("No Oracle was spent");
  });
});

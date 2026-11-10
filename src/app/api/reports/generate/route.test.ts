import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  saveReportWithSpend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

import { POST } from "@/app/api/reports/generate/route";
import { getUserById, saveReportWithSpend } from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedSession = vi.mocked(getSession);
const mockedSave = vi.mocked(saveReportWithSpend);
const mockedUser = vi.mocked(getUserById);

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BIRTH = {
  date: "1990-05-01",
  hour: 12,
  minute: 0,
  latitude: 14.6,
  longitude: 121,
  gender: "female",
};

// Reports take no free-text story or question: the only
// attacker-controlled strings are birth inputs and the target date /
// year, and all of them are range- or format-validated before any
// generation. These tests pin the 400s without needing an API key.
describe("POST /api/reports/generate — input validation", () => {
  beforeEach(() => {
    mockedSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
  });

  it("rejects a targetDate that is not a real YYYY-MM-DD date with 400", async () => {
    const res = await POST(req({ type: "transit", birth: BIRTH, targetDate: "not-a-date" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("targetDate");
  });

  it("rejects a year outside 1900-2200 with 400", async () => {
    const res = await POST(req({ type: "year-ahead", birth: BIRTH, year: 1800 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("1900");
  });

  it("rejects a birth latitude outside -90..90 with 400", async () => {
    const res = await POST(
      req({ type: "transit", birth: { ...BIRTH, latitude: 120 }, targetDate: "2026-11-05" })
    );
    expect(res.status).toBe(400);
  });
});

// Batch D (B4, OWASP A01): reports need sign-in; a guest is refused
// before any validation, model call, or spend.
describe("POST /api/reports/generate — sign-in and persist-with-spend (Batch D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedUser.mockResolvedValue({ id: "u1", email: "a@b.co", credits: 3, created_at: "2026-11-05T00:00:00Z" });
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("refuses a guest with 401 before any model call, save, or spend", async () => {
    mockedSession.mockResolvedValue(null);
    const res = await POST(req({ type: "transit", birth: BIRTH, targetDate: "2026-11-05" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("Sign in");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("returns 402 before any model call when the balance is 0", async () => {
    mockedSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedUser.mockResolvedValue({ id: "u1", email: "a@b.co", credits: 0, created_at: "2026-11-05T00:00:00Z" });
    const res = await POST(req({ type: "transit", birth: BIRTH, targetDate: "2026-11-05" }));
    expect(res.status).toBe(402);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });
});

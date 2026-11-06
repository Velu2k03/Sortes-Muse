import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  saveReadingForUser: vi.fn(),
  updateReadingForUser: vi.fn(),
  listReadingsForUser: vi.fn(),
  deleteReadingForUser: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST, PATCH, DELETE } from "@/app/api/history/route";
import {
  saveReadingForUser,
  updateReadingForUser,
  deleteReadingForUser,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedSave = vi.mocked(saveReadingForUser);
const mockedUpdate = vi.mocked(updateReadingForUser);
const mockedDelete = vi.mocked(deleteReadingForUser);
const mockedGetSession = vi.mocked(getSession);

function req(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/history", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/history — per-reading byte cap (Phase B, R9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedSave.mockResolvedValue(undefined);
  });

  it("rejects a reading over 64 KB with 413 and saves nothing", async () => {
    const big = { id: "r-big", question: "q?", interpretation: "x".repeat(70_000) };
    const res = await POST(req("POST", { readings: [big] }));
    expect(res.status).toBe(413);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("rejects when Content-Length header exceeds 7 MB without parsing body", async () => {
    const jsonFn = vi.fn().mockImplementation(() => {
      throw new Error("json() should not be called");
    });
    const fakeReq = {
      headers: new Headers({ "content-length": String(8 * 1024 * 1024) }),
      json: jsonFn,
    } as unknown as NextRequest;
    const res = await POST(fakeReq);
    expect(res.status).toBe(413);
    expect(jsonFn).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("accepts a normal reading under the cap", async () => {
    const res = await POST(req("POST", { readings: [{ id: "r-ok", question: "q?" }] }));
    expect(res.status).toBe(200);
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it("a too-large reading rejects the whole batch (no partial sync)", async () => {
    const res = await POST(
      req("POST", {
        readings: [
          { id: "r-ok", question: "q?" },
          { id: "r-big", question: "q?", interpretation: "x".repeat(70_000) },
        ],
      })
    );
    expect(res.status).toBe(413);
    expect(mockedSave).not.toHaveBeenCalled();
  });
});

describe("PATCH/DELETE /api/history — per-user write limit (Phase B, R9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedUpdate.mockResolvedValue(true);
    mockedDelete.mockResolvedValue(true);
  });

  it("allows 20 writes per hour, then returns 429 (shared PATCH/DELETE bucket)", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await PATCH(req("PATCH", { id: "r1", nextStep: "Do the thing" }));
      expect(res.status).toBe(200);
    }
    expect((await PATCH(req("PATCH", { id: "r1", nextStep: "Do the thing" }))).status).toBe(429);
    // The bucket is shared: DELETE is exhausted by the PATCH writes too.
    expect((await DELETE(req("DELETE", { id: "r1" }))).status).toBe(429);
    expect(mockedUpdate).toHaveBeenCalledTimes(20);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("requires a session for PATCH and DELETE", async () => {
    mockedGetSession.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { id: "r1", nextStep: "x" }))).status).toBe(401);
    expect((await DELETE(req("DELETE", { id: "r1" }))).status).toBe(401);
  });
});

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/reports/generate/route";

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

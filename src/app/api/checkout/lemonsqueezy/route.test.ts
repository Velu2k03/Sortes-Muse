import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => null),
}));
vi.mock("@/lib/lemonsqueezy", () => ({
  lemonConfigured: () => true,
  createCheckout: vi.fn(async () => "https://lemonsqueezy.test/checkout"),
}));

import { POST } from "@/app/api/checkout/lemonsqueezy/route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/checkout/lemonsqueezy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/lemonsqueezy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("creates a checkout and returns its URL", async () => {
    const res = await POST(req({ packId: "pack5", email: "buyer@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      url: "https://lemonsqueezy.test/checkout",
    });
  });

  it("rejects an unknown pack", async () => {
    const res = await POST(req({ packId: "pack99", email: "buyer@example.com" }));
    expect(res.status).toBe(400);
  });
});

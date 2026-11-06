import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";
import { createCheckout } from "@/lib/lemonsqueezy";

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

const mockedCreateCheckout = vi.mocked(createCheckout);

import { POST } from "@/app/api/checkout/lemonsqueezy/route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/checkout/lemonsqueezy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/lemonsqueezy", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedCreateCheckout.mockResolvedValue("https://lemonsqueezy.test/checkout");
  });

  afterEach(() => {
    errorSpy.mockRestore();
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

  it("returns 500 and logs structured JSON when createCheckout throws", async () => {
    mockedCreateCheckout.mockRejectedValueOnce(
      new Error("Lemon Squeezy checkout failed (422): invalid variant")
    );
    const res = await POST(req({ packId: "pack5", email: "buyer@example.com" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Could not start checkout. Please try again.",
    });
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(
      logged.some(
        (l: string) =>
          l.includes("sortes-lemonsqueezy") &&
          l.includes("checkout-route-error") &&
          l.includes("422")
      )
    ).toBe(true);
  });
});

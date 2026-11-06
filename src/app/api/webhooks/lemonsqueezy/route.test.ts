import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

vi.mock("@/lib/db", () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  fulfillOrder: vi.fn(),
  revokeOrder: vi.fn(),
}));

// Phase B (R4): the webhook calls getOrder against the Lemon Squeezy
// API. Mock only that function; the real verifyOrderAmount /
// verifyApiOrder / signature helpers still run.
vi.mock("@/lib/lemonsqueezy", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/lemonsqueezy")>();
  return { ...orig, getOrder: vi.fn() };
});

import { POST } from "@/app/api/webhooks/lemonsqueezy/route";
import { getUserByEmail, createUser, fulfillOrder, revokeOrder } from "@/lib/db";
import { getOrder } from "@/lib/lemonsqueezy";

const mockedGetOrder = vi.mocked(getOrder);

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedCreateUser = vi.mocked(createUser);
const mockedFulfill = vi.mocked(fulfillOrder);
const mockedRevoke = vi.mocked(revokeOrder);

const SECRET = "test-webhook-secret";

function signedReq(payload: unknown): NextRequest {
  const raw = JSON.stringify(payload);
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
    method: "POST",
    headers: { "x-signature": sig, "Content-Type": "application/json" },
    body: raw,
  });
}

function orderCreated(overrides: Record<string, unknown> = {}) {
  return {
    meta: { event_name: "order_created" },
    data: {
      id: "ord_1",
      attributes: {
        user_email: "buyer@example.com",
        status: "paid",
        store_id: 42,
        currency: "USD",
        total: 399,
        subtotal: 399,
        first_order_item: { variant_id: 111 },
        ...overrides,
      },
    },
  };
}

function apiOrder(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "ord_1",
      type: "orders",
      attributes: {
        status: "paid",
        store_id: 42,
        currency: "USD",
        total: 399,
        subtotal: 399,
        first_order_item: { variant_id: 111 },
        ...overrides,
      },
    },
  };
}

describe("POST /api/webhooks/lemonsqueezy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
    process.env.LEMONSQUEEZY_STORE_ID = "42";
    process.env.LEMONSQUEEZY_VARIANT_PACK5 = "111";
    process.env.LEMONSQUEEZY_VARIANT_PACK12 = "222";
    process.env.LEMONSQUEEZY_VARIANT_PACK30 = "333";
    // The API lookup confirms the signed payload by default.
    mockedGetOrder.mockResolvedValue(apiOrder());
  });

  it("rejects a bad signature", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      headers: { "x-signature": "nope" },
      body: JSON.stringify(orderCreated()),
    });
    expect((await POST(req)).status).toBe(401);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON payload", async () => {
    const raw = "not-json";
    const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
    const req = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      headers: { "x-signature": sig, "Content-Type": "application/json" },
      body: raw,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid payload." });
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("rejects a wrong store id", async () => {
    const res = await POST(signedReq(orderCreated({ store_id: 99 })));
    expect(res.status).toBe(400);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("rejects a non-USD currency", async () => {
    const res = await POST(signedReq(orderCreated({ currency: "EUR" })));
    expect(res.status).toBe(400);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("rejects an amount that does not match the pack price", async () => {
    const res = await POST(signedReq(orderCreated({ total: 1, subtotal: 1 })));
    expect(res.status).toBe(400);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("fulfills a valid paid order atomically", async () => {
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreateUser.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedFulfill.mockResolvedValue({ transaction: null, credits: 5, duplicate: false });
    const res = await POST(signedReq(orderCreated()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockedFulfill).toHaveBeenCalledWith({
      userId: "u1",
      email: "buyer@example.com",
      packType: "pack5 (lemonsqueezy:ord_1)",
      amount: 3.99,
      readings: 5,
      orderId: "ord_1",
    });
  });

  it("reports a duplicate delivery without granting twice", async () => {
    mockedGetUserByEmail.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedFulfill.mockResolvedValue({ transaction: null, credits: 5, duplicate: true });
    const res = await POST(signedReq(orderCreated()));
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true });
  });

  it("ignores unpaid orders", async () => {
    const res = await POST(signedReq(orderCreated({ status: "pending" })));
    expect(await res.json()).toMatchObject({ ok: true, ignored: "not paid" });
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("revokes credits on order_refunded", async () => {
    mockedRevoke.mockResolvedValue({ revoked: true, readings: 5 });
    const res = await POST(
      signedReq({ meta: { event_name: "order_refunded" }, data: { id: "ord_1", attributes: {} } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, refunded: true });
    expect(mockedRevoke).toHaveBeenCalledWith("ord_1", "");
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("does not fail a refund with nothing to revoke", async () => {
    mockedRevoke.mockResolvedValue({ revoked: false, readings: 0 });
    const res = await POST(
      signedReq({ meta: { event_name: "order_refunded" }, data: { id: "ord_9", attributes: {} } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, refunded: false });
  });

  // Phase B (R4): the fulfilment must be confirmed against the Lemon
  // Squeezy API. Any lookup failure or mismatch refuses to fulfil
  // with a 500, so Lemon Squeezy retries instead of the order being
  // silently dropped or wrongly granted.
  it("refuses to fulfil when the API lookup fails (500, retries)", async () => {
    mockedGetOrder.mockResolvedValue(null);
    const res = await POST(signedReq(orderCreated()));
    expect(res.status).toBe(500);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("refuses to fulfil when the API order is not paid", async () => {
    mockedGetOrder.mockResolvedValue(apiOrder({ status: "pending" }));
    const res = await POST(signedReq(orderCreated()));
    expect(res.status).toBe(500);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("refuses to fulfil on an API store, variant, or amount mismatch", async () => {
    mockedGetOrder.mockResolvedValue(apiOrder({ store_id: 99 }));
    expect((await POST(signedReq(orderCreated()))).status).toBe(500);
    mockedGetOrder.mockResolvedValue(apiOrder({ first_order_item: { variant_id: 222 } }));
    expect((await POST(signedReq(orderCreated()))).status).toBe(500);
    mockedGetOrder.mockResolvedValue(apiOrder({ total: 1, subtotal: 1 }));
    expect((await POST(signedReq(orderCreated()))).status).toBe(500);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("refuses to fulfil when the API order id differs from the webhook order", async () => {
    const other = apiOrder();
    other.data.id = "ord_other";
    mockedGetOrder.mockResolvedValue(other);
    const res = await POST(signedReq(orderCreated()));
    expect(res.status).toBe(500);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  // Phase B (R8): a database error mid-fulfilment returns a 500 with
  // a structured log line instead of a bare crash, so Lemon Squeezy
  // retries and the failure is visible in the logs.
  it("returns 500 when fulfilment throws (database error)", async () => {
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreateUser.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedFulfill.mockRejectedValue(new Error("connection terminated"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedReq(orderCreated()));
    expect(res.status).toBe(500);
    expect(
      errorSpy.mock.calls.some((c) =>
        String(c[0]).includes("sortes-webhook") && String(c[0]).includes("webhook-error")
      )
    ).toBe(true);
    errorSpy.mockRestore();
  });

  it("returns 400 when fulfilment throws non-transient User not found error", async () => {
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreateUser.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedFulfill.mockRejectedValue(new Error("User not found during fulfillment"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedReq(orderCreated()));
    expect(res.status).toBe(400);
    expect(
      errorSpy.mock.calls.some((c) =>
        String(c[0]).includes("sortes-webhook") &&
        String(c[0]).includes("webhook-error") &&
        String(c[0]).includes("User not found during fulfillment")
      )
    ).toBe(true);
    errorSpy.mockRestore();
  });

  // Phase B (R14): the refund branch verifies the store id before
  // revoking. A missing store_id is tolerated (older payloads may
  // omit it) and logged; the HMAC signature is still the
  // authentication, and revocation is idempotent and bounded by the
  // original fulfilment.
  it("refuses a refund whose store id does not match", async () => {
    const res = await POST(
      signedReq({
        meta: { event_name: "order_refunded" },
        data: { id: "ord_1", attributes: { store_id: 99 } },
      })
    );
    expect(res.status).toBe(400);
    expect(mockedRevoke).not.toHaveBeenCalled();
  });

  it("revokes a refund whose store id matches", async () => {
    mockedRevoke.mockResolvedValue({ revoked: true, readings: 5 });
    const res = await POST(
      signedReq({
        meta: { event_name: "order_refunded" },
        data: { id: "ord_1", attributes: { store_id: 42 } },
      })
    );
    expect(res.status).toBe(200);
    expect(mockedRevoke).toHaveBeenCalledWith("ord_1", "");
  });
});

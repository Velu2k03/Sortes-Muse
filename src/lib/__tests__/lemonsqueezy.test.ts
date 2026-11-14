import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import {
  readingsForVariant,
  packIdForVariant,
  expectedTotalCentsForVariant,
  verifyOrderAmount,
  verifyWebhookSignature,
  createCheckout,
  getOrder,
  verifyApiOrder,
  listSubscriptionInvoices,
} from "@/lib/lemonsqueezy";

describe("lemonsqueezy helpers", () => {
  beforeEach(() => {
    process.env.LEMONSQUEEZY_API_KEY = "test-key";
    process.env.LEMONSQUEEZY_STORE_ID = "12345";
    process.env.LEMONSQUEEZY_VARIANT_PACK5 = "111";
    process.env.LEMONSQUEEZY_VARIANT_PACK12 = "222";
    process.env.LEMONSQUEEZY_VARIANT_PACK30 = "333";
  });

  it("maps variants to readings and pack ids", () => {
    expect(readingsForVariant("111")).toBe(5);
    expect(readingsForVariant("222")).toBe(12);
    expect(readingsForVariant("333")).toBe(30);
    expect(readingsForVariant("999")).toBeNull();
    expect(packIdForVariant("111")).toBe("pack5");
    expect(packIdForVariant("222")).toBe("pack12");
    expect(packIdForVariant("333")).toBe("pack30");
  });

  it("derives expected totals from the pack prices (5/$3.99, 12/$7.99, 30/$14.99)", () => {
    expect(expectedTotalCentsForVariant("111")).toBe(399);
    expect(expectedTotalCentsForVariant("222")).toBe(799);
    expect(expectedTotalCentsForVariant("333")).toBe(1499);
    expect(expectedTotalCentsForVariant("999")).toBeNull();
  });

  it("accepts an exact total", () => {
    expect(verifyOrderAmount({ total: 399 }, "111")).toBe(true);
    expect(verifyOrderAmount({ total: 1499 }, "333")).toBe(true);
  });

  it("accepts a matching subtotal with tax on top", () => {
    expect(verifyOrderAmount({ total: 450, subtotal: 399 }, "111")).toBe(true);
  });

  it("rejects underpayment and discounts", () => {
    expect(verifyOrderAmount({ total: 1 }, "111")).toBe(false);
    expect(verifyOrderAmount({ total: 100, subtotal: 399 }, "111")).toBe(false);
    expect(verifyOrderAmount({ total: 799 }, "111")).toBe(false);
    expect(verifyOrderAmount({}, "111")).toBe(false);
    expect(verifyOrderAmount({ total: 399 }, "999")).toBe(false);
  });

  it("verifies the HMAC webhook signature", () => {
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "test-secret";
    const raw = '{"meta":{"event_name":"order_created"}}';
    const good = createHmac("sha256", "test-secret").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, good)).toBe(true);
    expect(verifyWebhookSignature(raw, "deadbeef")).toBe(false);
    expect(verifyWebhookSignature(raw, null)).toBe(false);
    expect(verifyWebhookSignature(raw + "x", good)).toBe(false);
  });

  // Phase B (R4): the webhook verifies the order against the Lemon
  // Squeezy API instead of trusting only the signed payload. getOrder
  // takes an injectable fetch so tests never call live Lemon Squeezy.
  describe("getOrder", () => {
    const paidOrder = {
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
        },
      },
    };

    it("returns the parsed order on a 200", async () => {
      let capturedUrl: unknown;
      const fetchFn = vi.fn(async (url: unknown) => {
        capturedUrl = url;
        return { ok: true, json: async () => paidOrder };
      });
      const order = await getOrder("ord_1", fetchFn as unknown as typeof fetch);
      expect(order).toEqual(paidOrder);
      expect(String(capturedUrl)).toContain("/v1/orders/ord_1");
      expect(String(capturedUrl)).not.toContain("ord_1x");
    });

    it("returns null on a non-OK response and never throws", async () => {
      const fetchFn = vi.fn(async () => ({ ok: false, status: 404 }));
      await expect(
        getOrder("ord_missing", fetchFn as unknown as typeof fetch)
      ).resolves.toBeNull();
    });

    it("returns null when the fetch itself fails", async () => {
      const fetchFn = vi.fn(async () => {
        throw new Error("network down");
      });
      await expect(
        getOrder("ord_1", fetchFn as unknown as typeof fetch)
      ).resolves.toBeNull();
    });

    it("returns null without an API key (fail closed, no unauthenticated call)", async () => {
      delete process.env.LEMONSQUEEZY_API_KEY;
      const fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => paidOrder,
      }));
      await expect(
        getOrder("ord_1", fetchFn as unknown as typeof fetch)
      ).resolves.toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("returns null within budget when the fetch hangs and times out", async () => {
      const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const signal = init?.signal;
        await new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        });
        return { ok: true, json: async () => paidOrder };
      });

      const start = Date.now();
      const order = await getOrder("ord_1", fetchFn as unknown as typeof fetch, 50);
      const elapsed = Date.now() - start;

      expect(order).toBeNull();
      expect(elapsed).toBeLessThan(1000);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }, 1500);
  });

  describe("verifyApiOrder", () => {
    const apiOrder = {
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
        },
      },
    };
    const expected = { orderId: "ord_1", storeId: "42", variantId: "111" };

    it("accepts a paid order that matches id, store, variant, and amount", () => {
      expect(verifyApiOrder(apiOrder, expected)).toBe(true);
    });

    it("accepts a matching subtotal with tax on top", () => {
      const taxed = structuredClone(apiOrder);
      taxed.data.attributes.total = 450;
      expect(verifyApiOrder(taxed, expected)).toBe(true);
    });

    it("rejects an unpaid order", () => {
      const unpaid = structuredClone(apiOrder);
      unpaid.data.attributes.status = "pending";
      expect(verifyApiOrder(unpaid, expected)).toBe(false);
    });

    it("rejects a wrong order id, store, or variant", () => {
      const wrongId = structuredClone(apiOrder);
      wrongId.data.id = "ord_2";
      expect(verifyApiOrder(wrongId, expected)).toBe(false);
      const wrongStore = structuredClone(apiOrder);
      wrongStore.data.attributes.store_id = 99;
      expect(verifyApiOrder(wrongStore, expected)).toBe(false);
      const wrongVariant = structuredClone(apiOrder);
      wrongVariant.data.attributes.first_order_item.variant_id = 222;
      expect(verifyApiOrder(wrongVariant, expected)).toBe(false);
    });

    it("rejects an underpaid order", () => {
      const cheap = structuredClone(apiOrder);
      cheap.data.attributes.total = 1;
      cheap.data.attributes.subtotal = 1;
      expect(verifyApiOrder(cheap, expected)).toBe(false);
    });

    it("rejects null, malformed, and missing-attribute payloads", () => {
      expect(verifyApiOrder(null, expected)).toBe(false);
      expect(verifyApiOrder({}, expected)).toBe(false);
      expect(verifyApiOrder({ data: {} }, expected)).toBe(false);
      expect(verifyApiOrder({ data: { id: "ord_1" } }, expected)).toBe(false);
    });
  });

  describe("createCheckout", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("creates a checkout with correct payload shape and returns the URL", async () => {
      let capturedBody: unknown;
      const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          json: async () => ({
            data: {
              type: "checkouts",
              id: "co_123",
              attributes: { url: "https://test.lemonsqueezy.com/checkout/123" },
            },
          }),
        };
      });

      const url = await createCheckout({
        packId: "pack5",
        email: "test@example.com",
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      expect(url).toBe("https://test.lemonsqueezy.com/checkout/123");
      expect(capturedBody).toEqual({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: "test@example.com",
              custom: { pack_id: "pack5", readings: "5" },
            },
            product_options: {
              redirect_url: "https://sortes.resonantatlas.com/oracles?purchase=success",
            },
          },
          relationships: {
            store: { data: { type: "stores", id: "12345" } },
            variant: { data: { type: "variants", id: "111" } },
          },
        },
      });
    });

    it("includes user_id in checkout_data.custom for a signed-in checkout", async () => {
      let capturedBody: unknown;
      const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          json: async () => ({
            data: {
              type: "checkouts",
              id: "co_123",
              attributes: { url: "https://test.lemonsqueezy.com/checkout/123" },
            },
          }),
        };
      });

      const url = await createCheckout({
        packId: "pack5",
        email: "test@example.com",
        userId: "u-1",
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      expect(url).toBe("https://test.lemonsqueezy.com/checkout/123");
      const custom = (capturedBody as { data: { attributes: { checkout_data: { custom: unknown } } } })
        .data.attributes.checkout_data.custom;
      // Bug 1 fix: the signed-in user id travels in custom_data so
      // the webhook can attribute the paid order to the signed-in
      // account even when Lemon Squeezy reports the Link email.
      expect(custom).toEqual({ pack_id: "pack5", readings: "5", user_id: "u-1" });
    });

    it("logs structured error and throws when Lemon Squeezy returns non-OK", async () => {
      const fetchFn = vi.fn(async () => ({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ errors: [{ detail: "Store not found" }] }),
      }));

      await expect(
        createCheckout({
          packId: "pack5",
          fetchFn: fetchFn as unknown as typeof fetch,
        })
      ).rejects.toThrow("Lemon Squeezy checkout failed (422)");

      const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(
        logged.some(
          (l: string) =>
            l.includes("sortes-lemonsqueezy") &&
            l.includes("checkout-failed") &&
            l.includes("422") &&
            l.includes("Store not found")
        )
      ).toBe(true);
    });

    it("throws within budget when the fetch hangs and times out", async () => {
      const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const signal = init?.signal;
        await new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        });
        return {
          ok: true,
          json: async () => ({
            data: {
              type: "checkouts",
              id: "co_123",
              attributes: { url: "https://test.lemonsqueezy.com/checkout/123" },
            },
          }),
        };
      });

      const start = Date.now();
      await expect(
        createCheckout({
          packId: "pack5",
          fetchFn: fetchFn as unknown as typeof fetch,
          timeoutMs: 50,
        })
      ).rejects.toThrow();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }, 1500);
  });

  describe("listSubscriptionInvoices", () => {
    it("lists the store's invoices, newest first, page size 50", async () => {
      let capturedUrl: unknown;
      const payload = { data: [], meta: { page: { total: 0 } } };
      const fetchFn = vi.fn(async (url: unknown) => {
        capturedUrl = url;
        return { ok: true, json: async () => payload };
      });
      const result = await listSubscriptionInvoices("42", fetchFn as unknown as typeof fetch);
      expect(result).toEqual(payload);
      expect(String(capturedUrl)).toContain("/v1/subscription-invoices?");
      expect(String(capturedUrl)).toContain("filter%5Bstore_id%5D=42");
      expect(String(capturedUrl)).toContain("page%5Bsize%5D=50");
    });

    it("returns null on a non-OK response and never throws", async () => {
      const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }));
      await expect(
        listSubscriptionInvoices("42", fetchFn as unknown as typeof fetch)
      ).resolves.toBeNull();
    });

    it("returns null without an API key (fail closed, no unauthenticated call)", async () => {
      delete process.env.LEMONSQUEEZY_API_KEY;
      const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
      await expect(
        listSubscriptionInvoices("42", fetchFn as unknown as typeof fetch)
      ).resolves.toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});

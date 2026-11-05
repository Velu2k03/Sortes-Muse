import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "crypto";
import {
  readingsForVariant,
  packIdForVariant,
  expectedTotalCentsForVariant,
  verifyOrderAmount,
  verifyWebhookSignature,
} from "@/lib/lemonsqueezy";

describe("lemonsqueezy helpers", () => {
  beforeEach(() => {
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
});

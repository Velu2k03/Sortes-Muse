import { describe, it, expect, beforeEach } from "vitest";
import {
  CREDIT_COSTS_ENABLED,
  READING_CREDIT_COSTS,
  readingCostForSpreadCards,
  chartCost,
  reportCost,
  followUpCost,
  expectedCentsForSubscription,
  expectedCentsForTopUp,
  isTopUpId,
} from "@/lib/subscription-tiers";
import {
  variantIdForSubscriptionKey,
  subscriptionVariantForId,
  subscriptionsConfigured,
  variantIdForTopUp,
  topUpCreditsForVariant,
  topUpIdForVariant,
  topUpsConfigured,
  verifyTopUpOrderAmount,
  verifyApiTopUpOrder,
  verifyApiSubscription,
  verifyApiSubscriptionInvoice,
} from "@/lib/lemonsqueezy";
import { periodKeyForDate } from "@/lib/subscription-webhook";
import {
  wholeMonthsBetween,
  addMonths,
  periodKeyForMonth,
} from "@/app/api/cron/subscription-drip/route";

// Phase 2 batch 3: billing rules + checkout/webhook wiring.
// The credit-cost flag ships OFF, so every cost helper returns 1
// (the old Oracle unit) until the cutover flips it. These tests pin
// that behaviour, the variant maps, the top-up verify rules, the
// subscription verify rules, and the drip month math.

describe("credit costs (flag OFF)", () => {
  it("the flag ships OFF", () => {
    expect(CREDIT_COSTS_ENABLED).toBe(false);
  });

  it("the plan numbers are Velu's exact values", () => {
    expect(READING_CREDIT_COSTS).toEqual({
      oneCard: 100,
      threeCard: 200,
      chart: 300,
      report: 300,
      followUp: 50,
    });
  });

  it("every cost helper returns 1 while the flag is OFF", () => {
    expect(readingCostForSpreadCards(1)).toBe(1);
    expect(readingCostForSpreadCards(3)).toBe(1);
    expect(readingCostForSpreadCards(10)).toBe(1);
    expect(chartCost()).toBe(1);
    expect(reportCost()).toBe(1);
    expect(followUpCost()).toBe(1);
  });
});

describe("subscription variant maps", () => {
  beforeEach(() => {
    process.env.LEMONSQUEEZY_VARIANT_SUB_SPARK_M = "s1";
    process.env.LEMONSQUEEZY_VARIANT_SUB_SPARK_Y = "s2";
    process.env.LEMONSQUEEZY_VARIANT_SUB_STAR_M = "s3";
    process.env.LEMONSQUEEZY_VARIANT_SUB_STAR_Y = "s4";
    process.env.LEMONSQUEEZY_VARIANT_SUB_MOON_M = "s5";
    process.env.LEMONSQUEEZY_VARIANT_SUB_MOON_Y = "s6";
  });

  it("maps keys to variant ids and back", () => {
    expect(variantIdForSubscriptionKey("spark-monthly")).toBe("s1");
    expect(variantIdForSubscriptionKey("moon-annual")).toBe("s6");
    expect(subscriptionVariantForId("s3")).toEqual({
      key: "star-monthly",
      tier: "star",
      interval: "monthly",
    });
    expect(subscriptionVariantForId("s4")).toEqual({
      key: "star-annual",
      tier: "star",
      interval: "annual",
    });
    expect(subscriptionVariantForId("nope")).toBeNull();
  });

  it("reports configured only when all six variants are set", () => {
    expect(subscriptionsConfigured()).toBe(true);
    delete process.env.LEMONSQUEEZY_VARIANT_SUB_MOON_Y;
    expect(subscriptionsConfigured()).toBe(false);
  });

  it("prices are Velu's exact numbers (Spark 799/7988, Star 1499/14988, Moon 2999/29988)", () => {
    expect(expectedCentsForSubscription("spark", "monthly")).toBe(799);
    expect(expectedCentsForSubscription("spark", "annual")).toBe(7988);
    expect(expectedCentsForSubscription("star", "monthly")).toBe(1499);
    expect(expectedCentsForSubscription("star", "annual")).toBe(14988);
    expect(expectedCentsForSubscription("moon", "monthly")).toBe(2999);
    expect(expectedCentsForSubscription("moon", "annual")).toBe(29988);
  });
});

describe("top-up maps and verify rules", () => {
  beforeEach(() => {
    process.env.LEMONSQUEEZY_VARIANT_TOPUP_1000 = "t1";
    process.env.LEMONSQUEEZY_VARIANT_TOPUP_3000 = "t2";
  });

  it("maps top-up ids to variant ids and back", () => {
    expect(variantIdForTopUp("topup-1000")).toBe("t1");
    expect(variantIdForTopUp("topup-3000")).toBe("t2");
    expect(topUpCreditsForVariant("t1")).toBe(1000);
    expect(topUpCreditsForVariant("t2")).toBe(3000);
    expect(topUpCreditsForVariant("nope")).toBeNull();
    expect(topUpIdForVariant("t1")).toBe("topup-1000");
    expect(topUpIdForVariant("t2")).toBe("topup-3000");
    expect(topUpIdForVariant("nope")).toBeNull();
    expect(isTopUpId("topup-1000")).toBe(true);
    expect(isTopUpId("pack5")).toBe(false);
  });

  it("reports configured only when both top-up variants are set", () => {
    expect(topUpsConfigured()).toBe(true);
    delete process.env.LEMONSQUEEZY_VARIANT_TOPUP_3000;
    expect(topUpsConfigured()).toBe(false);
  });

  it("top-up prices are Velu's exact numbers (1,000/$9.99, 3,000/$24.99)", () => {
    expect(expectedCentsForTopUp("topup-1000")).toBe(999);
    expect(expectedCentsForTopUp("topup-3000")).toBe(2499);
  });

  it("accepts an exact total and a matching subtotal with tax on top", () => {
    expect(verifyTopUpOrderAmount({ total: 999 }, "t1")).toBe(true);
    expect(verifyTopUpOrderAmount({ total: 2499 }, "t2")).toBe(true);
    expect(verifyTopUpOrderAmount({ total: 1100, subtotal: 999 }, "t1")).toBe(true);
  });

  it("rejects underpayment, discounts, and unknown variants", () => {
    expect(verifyTopUpOrderAmount({ total: 1 }, "t1")).toBe(false);
    expect(verifyTopUpOrderAmount({ total: 100, subtotal: 999 }, "t1")).toBe(false);
    expect(verifyTopUpOrderAmount({ total: 999 }, "nope")).toBe(false);
    expect(verifyTopUpOrderAmount({}, "t1")).toBe(false);
  });

  it("verifyApiTopUpOrder: paid, same store, same variant, right amount", () => {
    const order = {
      data: {
        id: "ord_9",
        attributes: {
          status: "paid",
          store_id: 42,
          first_order_item: { variant_id: "t1" },
          total: 999,
          subtotal: 999,
        },
      },
    };
    const expected = { orderId: "ord_9", storeId: "42", variantId: "t1" };
    expect(verifyApiTopUpOrder(order, expected)).toBe(true);
    expect(verifyApiTopUpOrder({ ...order, data: { ...order.data, attributes: { ...order.data.attributes, status: "refunded" } } }, expected)).toBe(false);
    expect(verifyApiTopUpOrder({ ...order, data: { ...order.data, attributes: { ...order.data.attributes, store_id: 43 } } }, expected)).toBe(false);
    expect(verifyApiTopUpOrder({ ...order, data: { ...order.data, attributes: { ...order.data.attributes, total: 1 } } }, expected)).toBe(false);
    expect(verifyApiTopUpOrder(null, expected)).toBe(false);
  });
});

describe("subscription verify rules", () => {
  beforeEach(() => {
    process.env.LEMONSQUEEZY_VARIANT_SUB_SPARK_M = "s1";
    process.env.LEMONSQUEEZY_VARIANT_SUB_STAR_M = "s3";
  });

  function subscription(id: string, status: string, variantId: string, storeId = 42) {
    return {
      data: {
        id,
        attributes: {
          status,
          store_id: storeId,
          first_subscription_item: { variant_id: variantId },
          renews_at: "2026-12-15T00:00:00.000Z",
          ends_at: null,
        },
      },
    };
  }

  it("verifyApiSubscription: same id, same store, a variant we sell", () => {
    expect(verifyApiSubscription(subscription("sub_1", "active", "s1"), { subscriptionId: "sub_1", storeId: "42" })).toBe(true);
    // A cancelled / past_due / expired subscription is still a real
    // subscription whose status the webhook must sync, not refuse.
    expect(verifyApiSubscription(subscription("sub_1", "cancelled", "s1"), { subscriptionId: "sub_1", storeId: "42" })).toBe(true);
    expect(verifyApiSubscription(subscription("sub_1", "past_due", "s1"), { subscriptionId: "sub_1", storeId: "42" })).toBe(true);
    expect(verifyApiSubscription(subscription("sub_1", "expired", "s1"), { subscriptionId: "sub_1", storeId: "42" })).toBe(true);
    expect(verifyApiSubscription(subscription("sub_2", "active", "s1"), { subscriptionId: "sub_1", storeId: "42" })).toBe(false);
    expect(verifyApiSubscription(subscription("sub_1", "active", "s1", 43), { subscriptionId: "sub_1", storeId: "42" })).toBe(false);
    expect(verifyApiSubscription(subscription("sub_1", "active", "nope"), { subscriptionId: "sub_1", storeId: "42" })).toBe(false);
    expect(verifyApiSubscription(null, { subscriptionId: "sub_1", storeId: "42" })).toBe(false);
  });

  it("verifyApiSubscriptionInvoice: paid, same store + subscription, right amount", () => {
    const invoice = {
      data: {
        id: "inv_1",
        attributes: {
          status: "paid",
          store_id: 42,
          subscription_id: "sub_1",
          total: 1499,
          subtotal: 1499,
        },
      },
    };
    const expected = { invoiceId: "inv_1", storeId: "42", subscriptionId: "sub_1", expectedTotalCents: 1499 };
    expect(verifyApiSubscriptionInvoice(invoice, expected)).toBe(true);
    // Tax on top is accepted when the subtotal matches.
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { ...invoice.data.attributes, total: 1600 } } },
        expected
      )
    ).toBe(true);
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { ...invoice.data.attributes, status: "pending" } } },
        expected
      )
    ).toBe(false);
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { ...invoice.data.attributes, subscription_id: "sub_2" } } },
        expected
      )
    ).toBe(false);
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { ...invoice.data.attributes, total: 1 } } },
        expected
      )
    ).toBe(false);
    expect(verifyApiSubscriptionInvoice(null, expected)).toBe(false);
  });
});

describe("period keys and drip month math", () => {
  it("periodKeyForDate is the UTC YYYY-MM", () => {
    expect(periodKeyForDate("2026-11-14T10:00:00.000Z")).toBe("2026-11");
    expect(periodKeyForDate(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01");
  });

  it("wholeMonthsBetween counts only complete months", () => {
    const start = new Date("2026-11-15T00:00:00.000Z");
    expect(wholeMonthsBetween(start, new Date("2026-11-15T00:00:00.000Z"))).toBe(0);
    expect(wholeMonthsBetween(start, new Date("2026-12-01T00:00:00.000Z"))).toBe(0);
    expect(wholeMonthsBetween(start, new Date("2026-12-15T00:00:00.000Z"))).toBe(1);
    expect(wholeMonthsBetween(start, new Date("2027-10-15T00:00:00.000Z"))).toBe(11);
    expect(wholeMonthsBetween(start, new Date("2027-11-15T00:00:00.000Z"))).toBe(12);
    expect(wholeMonthsBetween(start, new Date("2026-11-01T00:00:00.000Z"))).toBe(0);
  });

  it("addMonths lands on the billing anniversary", () => {
    const start = new Date("2026-11-15T00:00:00.000Z");
    expect(periodKeyForMonth(addMonths(start, 0))).toBe("2026-11");
    expect(periodKeyForMonth(addMonths(start, 1))).toBe("2026-12");
    expect(periodKeyForMonth(addMonths(start, 11))).toBe("2027-10");
    expect(periodKeyForMonth(addMonths(start, 12))).toBe("2027-11");
  });

  it("addMonths clamps to the last day of a short month", () => {
    // Jan 31 + 1 month is Feb 28 (2026 is not a leap year), NOT
    // Mar 3 (what Date.UTC does when the day overflows). Without
    // the clamp, months 1 and 2 would both build the period key
    // "2026-03" and the Feb grant would be skipped as a duplicate.
    const start = new Date("2026-01-31T00:00:00.000Z");
    expect(addMonths(start, 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths(start, 2).toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(addMonths(start, 3).toISOString()).toBe("2026-04-30T00:00:00.000Z");
    expect(periodKeyForMonth(addMonths(start, 1))).toBe("2026-02");
    expect(periodKeyForMonth(addMonths(start, 2))).toBe("2026-03");
    expect(periodKeyForMonth(addMonths(start, 3))).toBe("2026-04");
  });

  it("the drip never grants a future cycle's first month early", () => {
    // A Nov 15 2026 annual cycle: on Nov 1 2027 the elapsed whole
    // months are 11 (Nov 2026 -> Oct 2027), so the cron grants
    // months 0..11 and never touches Nov 2027 (month 12 of the old
    // cycle, month 0 of the new one — that one is the renewal
    // invoice's grant, on Nov 15).
    const start = new Date("2026-11-15T00:00:00.000Z");
    const nov1 = new Date("2027-11-01T00:00:00.000Z");
    expect(wholeMonthsBetween(start, nov1)).toBe(11);
    expect(periodKeyForMonth(addMonths(start, 11))).toBe("2027-10");
  });
});

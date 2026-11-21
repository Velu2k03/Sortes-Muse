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
  ORACLE_TO_CREDITS,
  SUBSCRIPTION_TIERS,
  TOPUPS,
  creditsLabel,
  purchaseAmountLabel,
} from "@/lib/subscription-tiers";
import { grantedCreditsForOrder } from "@/lib/db/orders";
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
// Credit cutover (2026-11-20): the credit-cost flag is ON, so every
// cost helper returns its credit price. These tests pin that
// behaviour, the variant maps, the top-up verify rules, the
// subscription verify rules, and the drip month math.

describe("credit costs (flag ON)", () => {
  it("the flag is ON after the cutover", () => {
    expect(CREDIT_COSTS_ENABLED).toBe(true);
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

  it("every cost helper returns the credit price while the flag is ON", () => {
    expect(readingCostForSpreadCards(1)).toBe(100);
    expect(readingCostForSpreadCards(3)).toBe(200);
    expect(readingCostForSpreadCards(10)).toBe(300);
    expect(chartCost()).toBe(300);
    expect(reportCost()).toBe(300);
    expect(followUpCost()).toBe(50);
  });

  it("the prices and top-ups match Velu's pricing config", () => {
    expect(ORACLE_TO_CREDITS).toBe(300);
    expect(TOPUPS).toEqual([
      { id: "topup-1000", credits: 1000, price: 9.99 },
      { id: "topup-3000", credits: 3000, price: 24.99 },
    ]);
    expect(SUBSCRIPTION_TIERS.spark.monthlyCredits).toBe(1000);
    expect(SUBSCRIPTION_TIERS.star.monthlyCredits).toBe(2500);
    expect(SUBSCRIPTION_TIERS.moon.monthlyCredits).toBe(6000);
    expect(expectedCentsForSubscription("spark", "monthly")).toBe(999);
    expect(expectedCentsForSubscription("star", "monthly")).toBe(1999);
    expect(expectedCentsForSubscription("moon", "monthly")).toBe(3999);
    expect(expectedCentsForSubscription("spark", "annual")).toBe(10388);
    expect(expectedCentsForSubscription("star", "annual")).toBe(20988);
    expect(expectedCentsForSubscription("moon", "annual")).toBe(41988);
  });

  it("credit copy: singular and plural, en-US grouping", () => {
    expect(creditsLabel(1)).toBe("1 credit");
    expect(creditsLabel(50)).toBe("50 credits");
    expect(creditsLabel(1000)).toBe("1,000 credits");
  });

  it("purchase history keeps the Oracle unit for retired pack rows only", () => {
    expect(purchaseAmountLabel(5, "pack5 (lemonsqueezy:1)")).toBe("5 Oracles");
    expect(purchaseAmountLabel(30, "pack30")).toBe("30 Oracles");
    expect(purchaseAmountLabel(1000, "topup-1000 (lemonsqueezy:2)")).toBe("1,000 credits");
    expect(purchaseAmountLabel(2100, "oracle-conversion")).toBe("2,100 credits");
    expect(purchaseAmountLabel(1, "admin-test-grant")).toBe("1 credit");
  });

  it("PR #175 P2: a post-flip pack grant (pack size x 300) is labeled in credits; legacy pack rows stay Oracles", () => {
    expect(purchaseAmountLabel(1500, "pack5 (lemonsqueezy:3)")).toBe("1,500 credits");
    expect(purchaseAmountLabel(3600, "pack12 (lemonsqueezy:4)")).toBe("3,600 credits");
    expect(purchaseAmountLabel(9000, "pack30 (lemonsqueezy:5)")).toBe("9,000 credits");
    expect(purchaseAmountLabel(5, "pack5 (lemonsqueezy:1)")).toBe("5 Oracles");
    expect(purchaseAmountLabel(12, "pack12 (lemonsqueezy:6)")).toBe("12 Oracles");
  });
});

// Credit cutover (audit §5.1): the webhook passes grantUnit "oracles"
// for every pack (it used to pass "credits" once the flag was ON, which
// granted 5 credits for a $3.99 pack). With the flag ON, "oracles"
// converts the pack's Oracle count x300; top-ups stay as-is.
describe("pack grant after the flip (no under-grant)", () => {
  it("packs grant 1,500 / 3,600 / 9,000 credits", () => {
    expect(grantedCreditsForOrder(5, "oracles")).toBe(1500);
    expect(grantedCreditsForOrder(12, "oracles")).toBe(3600);
    expect(grantedCreditsForOrder(30, "oracles")).toBe(9000);
  });

  it("top-ups grant their credits as-is", () => {
    expect(grantedCreditsForOrder(1000, "credits")).toBe(1000);
    expect(grantedCreditsForOrder(3000, "credits")).toBe(3000);
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

  it("prices are Velu's exact numbers (Spark 999/10388, Star 1999/20988, Moon 3999/41988)", () => {
    expect(expectedCentsForSubscription("spark", "monthly")).toBe(999);
    expect(expectedCentsForSubscription("spark", "annual")).toBe(10388);
    expect(expectedCentsForSubscription("star", "monthly")).toBe(1999);
    expect(expectedCentsForSubscription("star", "annual")).toBe(20988);
    expect(expectedCentsForSubscription("moon", "monthly")).toBe(3999);
    expect(expectedCentsForSubscription("moon", "annual")).toBe(41988);
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
          total: 1999,
          subtotal: 1999,
        },
      },
    };
    const expected = { invoiceId: "inv_1", storeId: "42", subscriptionId: "sub_1", expectedTotalCents: 1999 };
    expect(verifyApiSubscriptionInvoice(invoice, expected)).toBe(true);
    // Tax on top is accepted when the subtotal matches.
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { ...invoice.data.attributes, total: 2100 } } },
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

  it("verifyApiSubscriptionInvoice: a discounted invoice is accepted when the discount explains the lower total", () => {
    // Star monthly is 1999; a 500-cent discount code makes the total
    // 1499. The subtotal still matches the tier price, discount_total
    // is positive, and the total is at least subtotal minus discount.
    const invoice = {
      data: {
        id: "inv_1",
        attributes: {
          status: "paid",
          store_id: 42,
          subscription_id: "sub_1",
          total: 1499,
          subtotal: 1999,
          discount_total: 500,
        },
      },
    };
    const expected = { invoiceId: "inv_1", storeId: "42", subscriptionId: "sub_1", expectedTotalCents: 1999 };
    expect(verifyApiSubscriptionInvoice(invoice, expected)).toBe(true);
    // A discount plus tax on top is still a discount, not an overcharge.
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { ...invoice.data.attributes, total: 1550 } } },
        expected
      )
    ).toBe(true);
  });

  it("verifyApiSubscriptionInvoice: a lower total with no discount is still rejected", () => {
    const invoice = {
      data: {
        id: "inv_1",
        attributes: {
          status: "paid",
          store_id: 42,
          subscription_id: "sub_1",
          total: 1499,
          subtotal: 1999,
          discount_total: 0,
        },
      },
    };
    const expected = { invoiceId: "inv_1", storeId: "42", subscriptionId: "sub_1", expectedTotalCents: 1999 };
    expect(verifyApiSubscriptionInvoice(invoice, expected)).toBe(false);
    // A total below subtotal minus discount cannot be explained by
    // the discount either (the discount is smaller than the gap).
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { ...invoice.data.attributes, total: 900, discount_total: 500 } } },
        expected
      )
    ).toBe(false);
    // discount_total absent entirely is the same as no discount.
    expect(
      verifyApiSubscriptionInvoice(
        { ...invoice, data: { ...invoice.data, attributes: { total: 1499, subtotal: 1999, discount_total: undefined } } },
        expected
      )
    ).toBe(false);
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

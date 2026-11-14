import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    grantMonthlyCredits: vi.fn(),
    upsertSubscription: vi.fn(),
    getSubscriptionByProviderId: vi.fn(),
    expireMonthlyBalance: vi.fn(),
    revokeAllSubscriptionGrants: vi.fn(),
    // The real cycle-key helper: the test asserts the webhook
    // passes the invoice cycle's months to the revoke call.
    cyclePeriodKeys: actual.cyclePeriodKeys,
  };
});

import {
  getUserByEmail,
  getUserById,
  createUser,
  grantMonthlyCredits,
  upsertSubscription,
  getSubscriptionByProviderId,
  expireMonthlyBalance,
  revokeAllSubscriptionGrants,
} from "@/lib/db";
import { handleSubscriptionWebhook } from "@/lib/subscription-webhook";

// Phase 2 batch 3: the subscription webhook branches, with the DB
// and the Lemon Squeezy API both mocked. The API is stubbed through
// the global fetch (getSubscription / getSubscriptionInvoice take
// an injectable fetch, defaulting to the global one).

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedGetUserById = vi.mocked(getUserById);
const mockedCreateUser = vi.mocked(createUser);
const mockedGrantMonthlyCredits = vi.mocked(grantMonthlyCredits);
const mockedUpsertSubscription = vi.mocked(upsertSubscription);
const mockedGetSubscriptionByProviderId = vi.mocked(getSubscriptionByProviderId);
const mockedExpireMonthlyBalance = vi.mocked(expireMonthlyBalance);
const mockedRevokeAllSubscriptionGrants = vi.mocked(revokeAllSubscriptionGrants);

function subscriptionJson(id: string, status = "active", variantId = "s3") {
  return {
    data: {
      id,
      attributes: {
        status,
        store_id: 42,
        customer_id: 7,
        first_subscription_item: { variant_id: variantId },
        renews_at: "2026-12-15T00:00:00.000Z",
        ends_at: null,
        created_at: "2026-11-15T00:00:00.000Z",
        urls: { customer_portal: "https://example.com/portal" },
      },
    },
  };
}

function invoiceJson(id: string, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id,
      attributes: {
        status: "paid",
        store_id: 42,
        subscription_id: "sub_1",
        customer_id: 7,
        user_email: "buyer@example.com",
        billing_reason: "initial",
        total: 1499,
        subtotal: 1499,
        refunded_amount: 0,
        currency: "USD",
        created_at: "2026-11-15T00:00:00.000Z",
        ...overrides,
      },
    },
  };
}

describe("handleSubscriptionWebhook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.LEMONSQUEEZY_API_KEY = "test-key";
    process.env.LEMONSQUEEZY_STORE_ID = "42";
    process.env.LEMONSQUEEZY_VARIANT_SUB_STAR_M = "s3";
    process.env.LEMONSQUEEZY_VARIANT_SUB_SPARK_M = "s1";
    mockedGetUserById.mockResolvedValue({ id: "u1", email: "buyer@example.com" } as never);
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreateUser.mockResolvedValue({ id: "u1", email: "buyer@example.com" } as never);
    mockedGetSubscriptionByProviderId.mockResolvedValue(null);
    mockedUpsertSubscription.mockImplementation(async (args) => ({
      id: "s_1",
      user_id: args.userId,
      lemonsqueezy_subscription_id: args.lemonsqueezySubscriptionId,
      lemonsqueezy_customer_id: "7",
      tier: "star",
      billing_interval: "monthly",
      status: "active",
      current_period_start: "2026-11-15T00:00:00.000Z",
      current_period_end: "2026-12-15T00:00:00.000Z",
      renews_at: "2026-12-15T00:00:00.000Z",
      ends_at: null,
      cancel_at_period_end: false,
      refunded_at: null,
      created_at: "2026-11-15T00:00:00.000Z",
      updated_at: "2026-11-15T00:00:00.000Z",
    }));
    mockedGrantMonthlyCredits.mockResolvedValue({ granted: true, amount: 2500, balances: { monthly: 2500, purchased: 0, total: 2500 } } as never);
    mockedExpireMonthlyBalance.mockResolvedValue(0);
    mockedRevokeAllSubscriptionGrants.mockResolvedValue({ revoked: true, amount: 2500, periods: 1 } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(sub: unknown, inv: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/subscriptions/")) {
          return { ok: true, json: async () => sub } as never;
        }
        if (url.includes("/subscription-invoices/")) {
          return { ok: true, json: async () => inv } as never;
        }
        return { ok: false, json: async () => null } as never;
      })
    );
  }

  it("subscription_created syncs the row and grants nothing", async () => {
    stubFetch(subscriptionJson("sub_1"), null);
    const result = await handleSubscriptionWebhook("subscription_created", {
      meta: { event_name: "subscription_created", custom_data: { user_id: "u1" } },
      data: { id: "sub_1", attributes: { store_id: 42 } },
    });
    expect(result.status).toBe(200);
    expect(mockedUpsertSubscription).toHaveBeenCalledTimes(1);
    expect(mockedGrantMonthlyCredits).not.toHaveBeenCalled();
  });

  it("subscription_payment_success (initial) grants the first month", async () => {
    stubFetch(subscriptionJson("sub_1"), invoiceJson("inv_1"));
    const result = await handleSubscriptionWebhook("subscription_payment_success", {
      meta: { event_name: "subscription_payment_success" },
      data: { id: "inv_1", attributes: { store_id: 42, subscription_id: "sub_1", billing_reason: "initial", total: 1499, user_email: "buyer@example.com", created_at: "2026-11-15T00:00:00.000Z" } },
    });
    expect(result.status).toBe(200);
    expect(result.body.granted).toBe(true);
    expect(mockedGrantMonthlyCredits).toHaveBeenCalledTimes(1);
    const grantArgs = mockedGrantMonthlyCredits.mock.calls[0][0] as { periodKey: string; tier: string };
    expect(grantArgs.periodKey).toBe("2026-11");
    expect(grantArgs.tier).toBe("star");
  });

  it("subscription_updated after a renewal payment keeps the cycle start", async () => {
    // Year-2 renewal: the invoice date is the new cycle start.
    stubFetch(
      subscriptionJson("sub_1"),
      invoiceJson("inv_2", { billing_reason: "renewal", created_at: "2027-11-15T00:00:00.000Z" })
    );
    const pay = await handleSubscriptionWebhook("subscription_payment_success", {
      meta: { event_name: "subscription_payment_success" },
      data: { id: "inv_2", attributes: { store_id: 42, subscription_id: "sub_1", billing_reason: "renewal", total: 1499, user_email: "buyer@example.com", created_at: "2027-11-15T00:00:00.000Z" } },
    });
    expect(pay.status).toBe(200);
    expect(mockedUpsertSubscription).toHaveBeenCalledTimes(1);
    expect(
      (mockedUpsertSubscription.mock.calls[0][0] as { currentPeriodStart: string | null }).currentPeriodStart
    ).toBe("2027-11-15T00:00:00.000Z");
    // The renewal also fires subscription_updated; it must NOT reset
    // the start to the subscription's original created_at (year 1),
    // or the annual drip would re-grant year-1 months and never
    // grant year-2 months 1-11. A null start means "keep existing".
    stubFetch(subscriptionJson("sub_1"), null);
    const upd = await handleSubscriptionWebhook("subscription_updated", {
      meta: { event_name: "subscription_updated", custom_data: { user_id: "u1" } },
      data: { id: "sub_1", attributes: { store_id: 42 } },
    });
    expect(upd.status).toBe(200);
    expect(mockedUpsertSubscription).toHaveBeenCalledTimes(2);
    expect(
      (mockedUpsertSubscription.mock.calls[1][0] as { currentPeriodStart: string | null }).currentPeriodStart
    ).toBeNull();
  });

  it("subscription_payment_recovered grants the month, like payment_success", async () => {
    stubFetch(subscriptionJson("sub_1"), invoiceJson("inv_1"));
    const result = await handleSubscriptionWebhook("subscription_payment_recovered", {
      meta: { event_name: "subscription_payment_recovered" },
      data: { id: "inv_1", attributes: { store_id: 42, subscription_id: "sub_1", billing_reason: "renewal", total: 1499, user_email: "buyer@example.com", created_at: "2026-11-15T00:00:00.000Z" } },
    });
    expect(result.status).toBe(200);
    expect(result.body.granted).toBe(true);
    expect(mockedGrantMonthlyCredits).toHaveBeenCalledTimes(1);
    const grantArgs = mockedGrantMonthlyCredits.mock.calls[0][0] as { periodKey: string; tier: string };
    expect(grantArgs.periodKey).toBe("2026-11");
    expect(grantArgs.tier).toBe("star");
  });

  it("subscription_payment_success with billing_reason updated grants nothing", async () => {
    stubFetch(
      subscriptionJson("sub_1"),
      invoiceJson("inv_1", { billing_reason: "updated" })
    );
    const result = await handleSubscriptionWebhook("subscription_payment_success", {
      meta: { event_name: "subscription_payment_success" },
      data: { id: "inv_1", attributes: { store_id: 42, subscription_id: "sub_1", billing_reason: "updated", total: 1499, user_email: "buyer@example.com", created_at: "2026-11-15T00:00:00.000Z" } },
    });
    expect(result.status).toBe(200);
    expect(mockedGrantMonthlyCredits).not.toHaveBeenCalled();
  });

  it("subscription_payment_failed syncs the status and grants nothing", async () => {
    stubFetch(subscriptionJson("sub_1", "past_due"), invoiceJson("inv_1", { status: "pending" }));
    const result = await handleSubscriptionWebhook("subscription_payment_failed", {
      meta: { event_name: "subscription_payment_failed" },
      data: { id: "inv_1", attributes: { store_id: 42, subscription_id: "sub_1", user_email: "buyer@example.com" } },
    });
    expect(result.status).toBe(200);
    expect(mockedUpsertSubscription).toHaveBeenCalledTimes(1);
    expect(mockedGrantMonthlyCredits).not.toHaveBeenCalled();
  });

  it("subscription_expired zeroes the monthly balance", async () => {
    stubFetch(subscriptionJson("sub_1", "expired"), null);
    mockedExpireMonthlyBalance.mockResolvedValue(1200);
    const result = await handleSubscriptionWebhook("subscription_expired", {
      meta: { event_name: "subscription_expired", custom_data: { user_id: "u1" } },
      data: { id: "sub_1", attributes: { store_id: 42 } },
    });
    expect(result.status).toBe(200);
    expect(mockedExpireMonthlyBalance).toHaveBeenCalledWith("u1", "sub_1");
  });

  it("a store mismatch is a 500 (config error, so Lemon Squeezy retries)", async () => {
    stubFetch(subscriptionJson("sub_1"), null);
    const result = await handleSubscriptionWebhook("subscription_created", {
      meta: { event_name: "subscription_created", custom_data: { user_id: "u1" } },
      data: { id: "sub_1", attributes: { store_id: 999 } },
    });
    expect(result.status).toBe(500);
    expect(mockedUpsertSubscription).not.toHaveBeenCalled();
  });

  it("a missing subscription id stays a 400 (malformed payload, retrying will not help)", async () => {
    stubFetch(subscriptionJson("sub_1"), null);
    const result = await handleSubscriptionWebhook("subscription_created", {
      meta: { event_name: "subscription_created", custom_data: { user_id: "u1" } },
      data: { id: "", attributes: { store_id: 42 } },
    });
    expect(result.status).toBe(400);
    expect(mockedUpsertSubscription).not.toHaveBeenCalled();
  });

  it("an unverifiable subscription is a 500 (retry), never a grant", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => null }) as never));
    const result = await handleSubscriptionWebhook("subscription_created", {
      meta: { event_name: "subscription_created", custom_data: { user_id: "u1" } },
      data: { id: "sub_1", attributes: { store_id: 42 } },
    });
    expect(result.status).toBe(500);
    expect(mockedUpsertSubscription).not.toHaveBeenCalled();
    expect(mockedGrantMonthlyCredits).not.toHaveBeenCalled();
  });

  it("subscription_payment_refunded revokes every monthly grant for the cycle", async () => {
    stubFetch(
      subscriptionJson("sub_1"),
      invoiceJson("inv_1", { status: "refunded", refunded_amount: 1499 })
    );
    const result = await handleSubscriptionWebhook("subscription_payment_refunded", {
      meta: { event_name: "subscription_payment_refunded" },
      data: { id: "inv_1", attributes: { store_id: 42, subscription_id: "sub_1", total: 1499, user_email: "buyer@example.com", created_at: "2026-11-15T00:00:00.000Z" } },
    });
    expect(result.status).toBe(200);
    expect(mockedRevokeAllSubscriptionGrants).toHaveBeenCalledTimes(1);
    const revokeArgs = mockedRevokeAllSubscriptionGrants.mock.calls[0][0] as {
      periodKeys: string[];
      totalCents: number;
      refundedCents: number;
    };
    // Star monthly: the cycle is just the invoice's month.
    expect(revokeArgs.periodKeys).toEqual(["2026-11"]);
    expect(revokeArgs.totalCents).toBe(1499);
    expect(revokeArgs.refundedCents).toBe(1499);
  });
});

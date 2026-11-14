/**
 * Phase 2 batch 3: upsertSubscription on the local JSON store.
 * Claude review (PR #92): a subscription_updated on an annual
 * renewal reset current_period_start to the subscription's original
 * created_at, so the drip cron re-granted year-1 months and never
 * granted year-2 months 1-11. The fix: a null currentPeriodStart
 * means "keep the existing cycle start" (Postgres COALESCE +
 * local preserve); only an invoice (payment_success) supplies a
 * new one. This test pins the local branch; the Postgres branch
 * has the same COALESCE guard.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DbSubscription } from "@/lib/db/types";

const store: {
  users: Array<{ id: string; monthly_credits: number; purchased_credits: number; credits: number }>;
  subscriptions: DbSubscription[];
  creditGrants: Array<{ kind: string; amount: number; subscription_id: string }>;
} = { users: [], subscriptions: [], creditGrants: [] };

vi.mock("@/lib/db/client", () => ({
  usePostgres: false,
  pg: null,
  sql: vi.fn(),
  ensureSchema: vi.fn(async () => {}),
  txWithSignal: vi.fn((tx: unknown) => tx),
}));

vi.mock("@/lib/db/json-store", () => ({
  readLocal: vi.fn(async () => store),
  writeLocal: vi.fn(async () => {}),
}));

vi.mock("@/lib/db/orders", () => ({
  prorateRevoke: vi.fn(),
}));

import { upsertSubscription } from "@/lib/db/subscriptions";

function subRow(start: string | null): DbSubscription {
  return {
    id: "row_sub_1",
    user_id: "u_1",
    lemonsqueezy_subscription_id: "sub_1",
    lemonsqueezy_customer_id: "7",
    tier: "star",
    billing_interval: "annual",
    status: "active",
    current_period_start: start,
    current_period_end: "2027-11-15T00:00:00.000Z",
    renews_at: "2027-11-15T00:00:00.000Z",
    ends_at: null,
    cancel_at_period_end: false,
    refunded_at: null,
    created_at: "2026-11-15T00:00:00.000Z",
    updated_at: "2026-11-15T00:00:00.000Z",
  };
}

const upsertArgs = (currentPeriodStart: string | null) => ({
  userId: "u_1",
  lemonsqueezySubscriptionId: "sub_1",
  lemonsqueezyCustomerId: "7",
  tier: "star" as const,
  billingInterval: "annual" as const,
  status: "active",
  currentPeriodStart,
  currentPeriodEnd: "2028-11-15T00:00:00.000Z",
  renewsAt: "2028-11-15T00:00:00.000Z",
  endsAt: null,
  cancelAtPeriodEnd: false,
});

describe("upsertSubscription (local store)", () => {
  beforeEach(() => {
    store.users = [{ id: "u_1", monthly_credits: 0, purchased_credits: 0, credits: 0 }];
    store.subscriptions = [];
    store.creditGrants = [];
  });

  it("keeps the existing cycle start when the upsert passes null", async () => {
    store.subscriptions = [subRow("2027-11-15T00:00:00.000Z")];
    const row = await upsertSubscription(upsertArgs(null));
    expect(row.current_period_start).toBe("2027-11-15T00:00:00.000Z");
    expect(store.subscriptions[0].current_period_start).toBe("2027-11-15T00:00:00.000Z");
  });

  it("updates the cycle start when the upsert passes one", async () => {
    store.subscriptions = [subRow("2026-11-15T00:00:00.000Z")];
    const row = await upsertSubscription(upsertArgs("2027-11-15T00:00:00.000Z"));
    expect(row.current_period_start).toBe("2027-11-15T00:00:00.000Z");
  });

  it("a new row with a null start stores null (the drip falls back to created_at)", async () => {
    const row = await upsertSubscription(upsertArgs(null));
    expect(row.current_period_start).toBeNull();
    expect(store.subscriptions).toHaveLength(1);
  });
});

/**
 * Phase 2 batch 3: expireMonthlyBalance on the local JSON store.
 * Codex P1: the monthly pool is shared across a user's
 * subscriptions, so expiring one must NOT zero credits another
 * live subscription granted (the re-subscribe-during-grace-period
 * case). The Postgres branch has the same guard (a query for any
 * other non-expired row); this test pins the local branch.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const store: {
  users: Array<{ id: string; monthly_credits: number; purchased_credits: number; credits: number }>;
  subscriptions: Array<{
    id: string;
    user_id: string;
    lemonsqueezy_subscription_id: string;
    status: string;
    ends_at: string | null;
  }>;
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

import { expireMonthlyBalance } from "@/lib/db/subscriptions";

const user = () => ({
  id: "u_1",
  monthly_credits: 400,
  purchased_credits: 100,
  credits: 500,
});

function sub(id: string, status: string, endsAt: string | null) {
  return {
    id: `row_${id}`,
    user_id: "u_1",
    lemonsqueezy_subscription_id: id,
    lemonsqueezy_customer_id: "7",
    tier: "star" as const,
    billing_interval: "monthly" as const,
    status,
    current_period_start: null,
    current_period_end: null,
    renews_at: null,
    ends_at: endsAt,
    cancel_at_period_end: false,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

describe("expireMonthlyBalance (local store)", () => {
  beforeEach(() => {
    store.users = [user()];
    store.subscriptions = [];
    store.creditGrants = [];
  });

  it("zeroes the monthly balance and writes an expiry grant when nothing else is live", async () => {
    store.subscriptions = [sub("sub_old", "expired", "2026-11-15T00:00:00.000Z")];
    const removed = await expireMonthlyBalance("u_1", "sub_old");
    expect(removed).toBe(400);
    expect(store.users[0].monthly_credits).toBe(0);
    expect(store.users[0].purchased_credits).toBe(100);
    expect(store.creditGrants).toHaveLength(1);
    expect(store.creditGrants[0].kind).toBe("expiry");
    expect(store.creditGrants[0].amount).toBe(400);
  });

  it("leaves the balance alone when another subscription is still live", async () => {
    store.subscriptions = [
      sub("sub_old", "expired", "2026-11-15T00:00:00.000Z"),
      sub("sub_new", "active", null),
    ];
    const removed = await expireMonthlyBalance("u_1", "sub_old");
    expect(removed).toBe(0);
    expect(store.users[0].monthly_credits).toBe(400);
    expect(store.creditGrants).toHaveLength(0);
  });

  it("leaves the balance alone when the other subscription is in its grace period", async () => {
    store.subscriptions = [
      sub("sub_old", "expired", "2026-11-15T00:00:00.000Z"),
      sub("sub_new", "cancelled", "2099-01-01T00:00:00.000Z"),
    ];
    const removed = await expireMonthlyBalance("u_1", "sub_old");
    expect(removed).toBe(0);
    expect(store.users[0].monthly_credits).toBe(400);
  });
});

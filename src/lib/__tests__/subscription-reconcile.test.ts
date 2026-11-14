import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  toReconcileInvoices,
  findMissingPaidGrants,
} from "@/lib/subscription-reconcile";

vi.mock("@/lib/db", () => ({
  listGrantedSubscriptionPeriods: vi.fn(),
}));
vi.mock("@/lib/lemonsqueezy", () => ({
  listSubscriptionInvoices: vi.fn(),
}));

import { listGrantedSubscriptionPeriods } from "@/lib/db";
import { listSubscriptionInvoices } from "@/lib/lemonsqueezy";
import { GET } from "@/app/api/cron/subscription-reconcile/route";
import { NextRequest } from "next/server";

const mockedListGranted = vi.mocked(listGrantedSubscriptionPeriods);
const mockedListInvoices = vi.mocked(listSubscriptionInvoices);

function invoicePayload() {
  return {
    data: [
      {
        id: "inv_1",
        attributes: {
          status: "paid",
          subscription_id: "sub_1",
          billing_reason: "initial",
          created_at: "2026-11-15T00:00:00.000Z",
        },
      },
      {
        id: "inv_2",
        attributes: {
          status: "paid",
          subscription_id: "sub_2",
          billing_reason: "renewal",
          created_at: "2026-11-15T00:00:00.000Z",
        },
      },
      {
        id: "inv_3",
        attributes: {
          status: "refunded",
          subscription_id: "sub_3",
          created_at: "2026-11-15T00:00:00.000Z",
        },
      },
      {
        id: "inv_4",
        attributes: {
          status: "paid",
          subscription_id: "sub_4",
          billing_reason: "updated",
          created_at: "2026-11-15T00:00:00.000Z",
        },
      },
    ],
  };
}

describe("toReconcileInvoices", () => {
  it("pulls subscription, period and status out of the list payload", () => {
    expect(toReconcileInvoices(invoicePayload())).toEqual([
      { subscriptionId: "sub_1", periodKey: "2026-11", status: "paid", billingReason: "initial" },
      { subscriptionId: "sub_2", periodKey: "2026-11", status: "paid", billingReason: "renewal" },
      { subscriptionId: "sub_3", periodKey: "2026-11", status: "refunded", billingReason: undefined },
      { subscriptionId: "sub_4", periodKey: "2026-11", status: "paid", billingReason: "updated" },
    ]);
  });

  it("drops malformed entries and non-list payloads", () => {
    expect(toReconcileInvoices(null)).toEqual([]);
    expect(toReconcileInvoices({ data: "nope" })).toEqual([]);
    expect(
      toReconcileInvoices({
        data: [
          { attributes: { status: "paid", created_at: "2026-11-15T00:00:00.000Z" } },
          { attributes: { status: "paid", subscription_id: "sub_9" } },
        ],
      })
    ).toEqual([]);
  });
});

describe("findMissingPaidGrants", () => {
  it("reports only paid invoices with no grant for that period", () => {
    const granted = new Map([["sub_1", new Set(["2026-11"])]]);
    const result = findMissingPaidGrants(toReconcileInvoices(invoicePayload()), granted);
    // sub_1 has its grant; sub_2 does not; sub_3 is refunded, so its
    // revoked grant is not "missing"; sub_4 is a paid plan-change
    // invoice (billing_reason "updated"), which the webhook
    // deliberately never grants — counting it would be a false alarm.
    expect(result.checked).toBe(2);
    expect(result.missing).toEqual([{ subscriptionId: "sub_2", periodKey: "2026-11" }]);
  });

  it("a grant for a different period does not cover this invoice", () => {
    const granted = new Map([["sub_1", new Set(["2026-10"])]]);
    const result = findMissingPaidGrants(
      [{ subscriptionId: "sub_1", periodKey: "2026-11", status: "paid" }],
      granted
    );
    expect(result.missing).toEqual([{ subscriptionId: "sub_1", periodKey: "2026-11" }]);
  });
});

describe("GET /api/cron/subscription-reconcile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.LEMONSQUEEZY_STORE_ID = "42";
    mockedListInvoices.mockResolvedValue(invoicePayload() as never);
    mockedListGranted.mockImplementation(async (subscriptionId: string) =>
      subscriptionId === "sub_1" ? ["2026-11"] : []
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function authedRequest() {
    return new NextRequest("http://localhost/api/cron/subscription-reconcile", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
  }

  it("returns 200 with the missing-grant summary and writes nothing", async () => {
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(2);
    expect(body.missing).toBe(1);
    expect(body.missingSubscriptions).toEqual(["sub_2"]);
    expect(body.missingPeriods).toEqual(["sub_2:2026-11"]);
    // Report-only: the route reads the grant list, it never grants.
    expect(mockedListGranted).toHaveBeenCalledTimes(2);
  });

  it("returns 401 without the cron secret", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/cron/subscription-reconcile")
    );
    expect(res.status).toBe(401);
    expect(mockedListInvoices).not.toHaveBeenCalled();
  });

  it("returns 500 when the invoice list cannot be retrieved", async () => {
    mockedListInvoices.mockResolvedValue(null as never);
    const res = await GET(authedRequest());
    expect(res.status).toBe(500);
  });
});

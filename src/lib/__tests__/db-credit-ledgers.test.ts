import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { pgTestUrl } from "./pg-test-url";
import { tu } from "./test-uuid";

/**
 * Phase 2 batch 2: the two-ledger credit system on real Postgres.
 * Runs ONLY when SORTES_TEST_DATABASE_URL_LEDGERS is set, against
 * that database (a dedicated local staging database, never
 * production). It has its OWN database — not the shared money DB —
 * because db-postgres.test.ts drops all tables in its beforeAll,
 * which landed mid-run in this suite's tests twice (6/10 failed).
 * The ledgers DB is created by the lint-gate guard step in CI
 * (same pattern as the migrations/RLS databases) and listed in
 * docs/STAGING.md for local setup.
 *
 *   SORTES_TEST_DATABASE_URL_LEDGERS=<redacted>
 */
const TEST_URL = pgTestUrl("SORTES_TEST_DATABASE_URL_LEDGERS");
const SKIP = !TEST_URL;

// Per-worker suffix: this suite never drops tables, so its users,
// reading ids, and order ids must not collide with a previous run's
// rows in the shared money DB (createUser returns the existing row
// on an email conflict, which would break the zero-balance tests).
const RUN = Math.random().toString(36).slice(2, 8);

type Db = typeof import("@/lib/db");

async function freshDb(): Promise<Db> {
  vi.resetModules();
  (process.env as Record<string, string | undefined>).POSTGRES_URL = TEST_URL;
  delete (process.env as Record<string, string | undefined>).DATABASE_URL;
  return (await import("@/lib/db")) as Db;
}

describe.skipIf(SKIP)("two-ledger credits on real Postgres (staging only)", () => {
  let db: Db;
  let raw: postgres.Sql;

  beforeAll(async () => {
    raw = postgres(TEST_URL, { prepare: false, max: 1 });
    db = await freshDb();
    await db.ensureSchema();
  }, 30_000);

  afterAll(async () => {
    await raw?.end();
  });

  it("migration 008 applied: ledger columns, generated total, grants table, constraints", async () => {
    const cols = (await raw`
      SELECT column_name, is_generated, generation_expression
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name IN ('monthly_credits', 'purchased_credits', 'credits')`) as Array<{
      column_name: string;
      is_generated: string;
      generation_expression: string | null;
    }>;
    const byName = new Map(cols.map((c) => [c.column_name, c]));
    expect(byName.has("monthly_credits")).toBe(true);
    expect(byName.has("purchased_credits")).toBe(true);
    // The old single balance is now the generated total of the ledgers.
    // information_schema reports is_generated as 'ALWAYS', not 'YES'.
    expect(byName.get("credits")?.is_generated).toBe("ALWAYS");
    expect(byName.get("credits")?.generation_expression).toMatch(/monthly_credits \+ purchased_credits/);
    const checks = (await raw`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('users_monthly_credits_nonnegative', 'users_purchased_credits_nonnegative', 'users_credits_nonnegative')`) as Array<{
      conname: string;
    }>;
    expect(checks.map((c) => c.conname).sort()).toEqual([
      "users_monthly_credits_nonnegative",
      "users_purchased_credits_nonnegative",
    ]);
    const tables = (await raw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'credit_grants'`) as Array<{
      table_name: string;
    }>;
    expect(tables).toHaveLength(1);
    const indexes = (await raw`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
        AND indexname LIKE 'idx_credit_grants%'`) as Array<{ indexname: string }>;
    expect(indexes.map((i) => i.indexname).sort()).toEqual([
      "idx_credit_grants_conversion_unique",
      "idx_credit_grants_period_unique",
      "idx_credit_grants_user_created",
    ]);
    // The per-ledger CHECKs bite: direct SQL cannot drive either ledger negative.
    const user = await db.createUser(`ledger-check-${RUN}@example.com`);
    await expect(
      raw.unsafe(`UPDATE users SET monthly_credits = -1 WHERE id = '${user.id}'`)
    ).rejects.toThrow(/users_monthly_credits_nonnegative/);
    await expect(
      raw.unsafe(`UPDATE users SET purchased_credits = -1 WHERE id = '${user.id}'`)
    ).rejects.toThrow(/users_purchased_credits_nonnegative/);
    // And the generated total cannot be written directly at all
    // (Postgres reports this as "can only be updated to DEFAULT").
    await expect(
      raw.unsafe(`UPDATE users SET credits = 99 WHERE id = '${user.id}'`)
    ).rejects.toThrow(/can only be updated to DEFAULT/);
  });

  it("new users start at zero in both ledgers; pack grants land in purchased", async () => {
    const user = await db.createUser(`ledger-new-${RUN}@example.com`);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 0, total: 0 });
    expect(await db.getCreditBalances("no-such-user")).toBeNull();
    const total = await db.addUserCredits(user.id, 5);
    expect(total).toBe(5);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 5, total: 5 });
    // The generated total is what the read sites see.
    const reread = await db.getUserById(user.id);
    expect(reread?.credits).toBe(5);
    expect(reread?.monthly_credits).toBe(0);
    expect(reread?.purchased_credits).toBe(5);
  });

  it("spendUserCredits takes monthly first, then purchased, and refuses when insufficient", async () => {
    const user = await db.createUser(`ledger-spend-${RUN}@example.com`);
    await db.addUserCredits(user.id, 5);
    await db.grantMonthlyCredits({
      userId: user.id,
      subscriptionId: `sub_ledger_spend-${RUN}`,
      tier: "star",
      periodKey: "2026-11",
    });
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 2500, purchased: 5, total: 2505 });
    expect(await db.spendUserCredits(user.id, 2502)).toBe(true);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 3, total: 3 });
    expect(await db.spendUserCredits(user.id, 4)).toBe(false);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 3, total: 3 });
    await expect(db.spendUserCredits(user.id, 0)).rejects.toThrow(/positive/);
    await expect(db.spendUserCredits(user.id, -1)).rejects.toThrow(/positive/);
  });

  it("monthly grant is idempotent per (subscription, period)", async () => {
    const user = await db.createUser(`ledger-idem-${RUN}@example.com`);
    const args = {
      userId: user.id,
      subscriptionId: `sub_ledger_idem-${RUN}`,
      tier: "star" as const,
      periodKey: "2026-11",
    };
    const first = await db.grantMonthlyCredits(args);
    expect(first).toEqual({
      granted: true,
      amount: 2500,
      balances: { monthly: 2500, purchased: 0, total: 2500 },
    });
    const retry = await db.grantMonthlyCredits(args);
    expect(retry.granted).toBe(false);
    expect(retry.amount).toBe(0);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 2500, purchased: 0, total: 2500 });
    // A different period grants again.
    const next = await db.grantMonthlyCredits({ ...args, periodKey: "2026-12" });
    expect(next.granted).toBe(true);
    expect(next.amount).toBe(2500);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 5000, purchased: 0, total: 5000 });
  });

  it("monthly rollover caps at two months of the plan, then resumes after spending", async () => {
    const user = await db.createUser(`ledger-cap-${RUN}@example.com`);
    const base = { userId: user.id, subscriptionId: `sub_ledger_cap-${RUN}`, tier: "star" as const };
    expect((await db.grantMonthlyCredits({ ...base, periodKey: "2026-11" })).amount).toBe(2500);
    expect((await db.grantMonthlyCredits({ ...base, periodKey: "2026-12" })).amount).toBe(2500);
    const capped = await db.grantMonthlyCredits({ ...base, periodKey: "2027-01" });
    expect(capped.granted).toBe(true);
    expect(capped.amount).toBe(0);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 5000, purchased: 0, total: 5000 });
    // The capped period is consumed: retrying it still grants nothing.
    expect((await db.grantMonthlyCredits({ ...base, periodKey: "2027-01" })).granted).toBe(false);
    // Spend 1,000, and the next month grants exactly the room back.
    expect(await db.spendUserCredits(user.id, 1000)).toBe(true);
    const refilled = await db.grantMonthlyCredits({ ...base, periodKey: "2027-02" });
    expect(refilled.amount).toBe(1000);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 5000, purchased: 0, total: 5000 });
  });

  it("grantMonthlyCredits rejects a bad tier or a missing period key", async () => {
    const user = await db.createUser(`ledger-badargs-${RUN}@example.com`);
    await expect(
      db.grantMonthlyCredits({
        userId: user.id,
        subscriptionId: `sub_ledger_bad-${RUN}`,
        tier: "platinum" as never,
        periodKey: "2026-11",
      })
    ).rejects.toThrow(/unknown tier/);
    await expect(
      db.grantMonthlyCredits({
        userId: user.id,
        subscriptionId: `sub_ledger_bad-${RUN}`,
        tier: "spark",
        periodKey: "",
      })
    ).rejects.toThrow(/periodKey/);
    await expect(
      db.grantMonthlyCredits({
        userId: user.id,
        subscriptionId: `sub_ledger_bad-${RUN}`,
        tier: "spark",
        periodKey: "2026-11-01",
      })
    ).rejects.toThrow(/YYYY-MM/);
    await expect(
      db.grantMonthlyCredits({
        userId: user.id,
        subscriptionId: `sub_ledger_bad-${RUN}`,
        tier: "spark",
        periodKey: "2026-13",
      })
    ).rejects.toThrow(/YYYY-MM/);
    await expect(
      db.grantMonthlyCredits({
        userId: "no-such-user",
        subscriptionId: `sub_ledger_bad-${RUN}`,
        tier: "spark",
        periodKey: "2026-11",
      })
    ).rejects.toThrow(/User not found/);
  });

  it("Oracle conversion: 1 Oracle = 300 purchased credits, once, with a conversion line", async () => {
    const user = await db.createUser(`ledger-convert-${RUN}@example.com`);
    await db.addUserCredits(user.id, 5);
    const done = await db.convertOraclesToCredits(user.id);
    expect(done).toEqual({
      converted: true,
      alreadyConverted: false,
      oracles: 5,
      credits: 1500,
      balances: { monthly: 0, purchased: 1500, total: 1500 },
    });
    // Purchased, so it never expires: the grant row carries no expiry.
    const grants = await db.listCreditGrants(user.id);
    expect(grants).toHaveLength(1);
    expect(grants[0].kind).toBe("conversion");
    expect(grants[0].amount).toBe(1500);
    expect(grants[0].expires_at).toBeNull();
    // The conversion line shows in purchase history.
    const txs = await db.listTransactions(user.id);
    expect(txs.some((t) => t.pack_type === "oracle-conversion" && t.readings === 1500)).toBe(true);
    // A second run is a no-op: same balance, no second row.
    const again = await db.convertOraclesToCredits(user.id);
    expect(again.converted).toBe(false);
    expect(again.alreadyConverted).toBe(true);
    expect(again.credits).toBe(1500);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 1500, total: 1500 });
    expect((await db.listCreditGrants(user.id)).filter((g) => g.kind === "conversion")).toHaveLength(1);
    // The converted balance spends (monthly is empty, so purchased is used).
    expect(await db.spendUserCredits(user.id, 300)).toBe(true);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 1200, total: 1200 });
  });

  it("Oracle conversion of a zero balance converts to zero and marks the user converted", async () => {
    const user = await db.createUser(`ledger-convert-zero-${RUN}@example.com`);
    const done = await db.convertOraclesToCredits(user.id);
    expect(done).toEqual({
      converted: true,
      alreadyConverted: false,
      oracles: 0,
      credits: 0,
      balances: { monthly: 0, purchased: 0, total: 0 },
    });
    const grants = await db.listCreditGrants(user.id);
    expect(grants).toHaveLength(1);
    expect(grants[0].kind).toBe("conversion");
    expect(grants[0].amount).toBe(0);
    // No history noise for a zero conversion.
    expect(await db.listTransactions(user.id)).toHaveLength(0);
    expect((await db.convertOraclesToCredits(user.id)).alreadyConverted).toBe(true);
  });

  it("existing spend sites still spend 1 per reading/report/follow-up, monthly first", async () => {
    const user = await db.createUser(`ledger-spendsites-${RUN}@example.com`);
    await db.grantMonthlyCredits({
      userId: user.id,
      subscriptionId: `sub_ledger_spendsites-${RUN}`,
      tier: "spark",
      periodKey: "2026-11",
    });
    const readingId = tu(`ledger-reading-1-${RUN}`);
    const saved = await db.saveReadingWithSpend(
      user.id,
      { id: readingId, free: false, question: "Test?" },
      false
    );
    expect(saved.ok).toBe(true);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 999, purchased: 0, total: 999 });
    // Replaying the same reading id spends nothing more.
    expect(
      (await db.saveReadingWithSpend(user.id, { id: readingId, free: false, question: "Test?" }, false)).existing
    ).toBe(true);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 999, purchased: 0, total: 999 });
    const reportId = tu(`ledger-report-1-${RUN}`);
    expect((await db.saveReportWithSpend(user.id, { id: reportId, title: "Test" })).ok).toBe(true);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 998, purchased: 0, total: 998 });
    const appended = await db.appendFollowUpWithSpend(
      user.id,
      readingId,
      { question: "And then?" },
      1,
      3,
      false,
      tu(`ledger-followup-1-${RUN}`)
    );
    expect(appended.ok).toBe(true);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 997, purchased: 0, total: 997 });
    // Insufficient: a broke user writes nothing.
    const broke = await db.createUser(`ledger-spendsites-broke-${RUN}@example.com`);
    expect(
      (await db.saveReadingWithSpend(broke.id, { id: tu(`ledger-reading-2-${RUN}`), free: false }, false)).ok
    ).toBe(false);
    expect(
      (await db.saveReportWithSpend(broke.id, { id: tu(`ledger-report-2-${RUN}`), title: "Test" })).ok
    ).toBe(false);
  });

  it("fulfillOrder still grants purchased credits; revoke takes them back", async () => {
    const user = await db.createUser(`ledger-fulfill-${RUN}@example.com`);
    const fulfilled = await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: `pack5 (lemonsqueezy:order-ledger-1-${RUN})`,
      amount: 3.99,
      readings: 5,
      orderId: `order-ledger-1-${RUN}`,
    });
    expect(fulfilled.duplicate).toBe(false);
    expect(fulfilled.credits).toBe(5);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 5, total: 5 });
    expect((await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: `pack5 (lemonsqueezy:order-ledger-1-${RUN})`,
      amount: 3.99,
      readings: 5,
      orderId: `order-ledger-1-${RUN}`,
    })).duplicate).toBe(true);
    const revoked = await db.revokeOrder(`order-ledger-1-${RUN}`, user.email);
    expect(revoked).toEqual({ revoked: true, readings: 5 });
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 0, total: 0 });
  });

  it("annual full refund revokes every dripped month, writes kind 'refund', and stops the drip", async () => {
    const user = await db.createUser(`ledger-annual-refund-${RUN}@example.com`);
    const subId = `sub_annual_refund-${RUN}`;
    await db.upsertSubscription({
      userId: user.id,
      lemonsqueezySubscriptionId: subId,
      lemonsqueezyCustomerId: "7",
      tier: "spark",
      billingInterval: "annual",
      status: "active",
      currentPeriodStart: "2026-11-15T00:00:00.000Z",
      currentPeriodEnd: "2027-11-15T00:00:00.000Z",
      renewsAt: "2027-11-15T00:00:00.000Z",
      endsAt: null,
      cancelAtPeriodEnd: false,
    });
    // Two months dripped (Spark: 1,000/month). The rollover cap is
    // two months of the plan, so a third month would grant 0; two
    // months is enough to prove ALL months are revoked, not just
    // the current one (the old single-month behaviour).
    for (const periodKey of ["2026-11", "2026-12"]) {
      const grant = await db.grantMonthlyCredits({
        userId: user.id,
        subscriptionId: subId,
        tier: "spark",
        periodKey,
        periodEnd: "2027-11-15T00:00:00.000Z",
      });
      expect(grant.granted).toBe(true);
    }
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 2000, purchased: 0, total: 2000 });
    // Full refund of the annual charge (Spark annual $79.88).
    const revoked = await db.revokeAllSubscriptionGrants({
      userId: user.id,
      subscriptionId: subId,
      totalCents: 7988,
      refundedCents: 7988,
    });
    expect(revoked).toEqual({ revoked: true, amount: 2000, periods: 2 });
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 0, total: 0 });
    // The revoke is audited as kind 'refund', not 'expiry':
    // two rows (one per month), amounts 1,000 / 1,000.
    const refundRows = (await db.listCreditGrants(user.id)).filter((g) => g.kind === "refund");
    expect(refundRows).toHaveLength(2);
    expect(refundRows.map((g) => g.amount).sort()).toEqual([1000, 1000]);
    expect(refundRows.every((g) => g.subscription_id === subId)).toBe(true);
    // The subscription is stamped refunded and leaves the drip list.
    const row = await db.getSubscriptionByProviderId(subId);
    expect(row?.refunded_at).not.toBeNull();
    expect((await db.listActiveAnnualSubscriptions()).some((s) => s.lemonsqueezy_subscription_id === subId)).toBe(false);
    // A redelivery revokes nothing more.
    const again = await db.revokeAllSubscriptionGrants({
      userId: user.id,
      subscriptionId: subId,
      totalCents: 7988,
      refundedCents: 7988,
    });
    expect(again).toEqual({ revoked: false, amount: 0, periods: 0 });
  });

  it("annual partial refund revokes the same share of each month and leaves the drip running", async () => {
    const user = await db.createUser(`ledger-annual-partial-${RUN}@example.com`);
    const subId = `sub_annual_partial-${RUN}`;
    await db.upsertSubscription({
      userId: user.id,
      lemonsqueezySubscriptionId: subId,
      lemonsqueezyCustomerId: "7",
      tier: "spark",
      billingInterval: "annual",
      status: "active",
      currentPeriodStart: "2026-11-15T00:00:00.000Z",
      currentPeriodEnd: "2027-11-15T00:00:00.000Z",
      renewsAt: "2027-11-15T00:00:00.000Z",
      endsAt: null,
      cancelAtPeriodEnd: false,
    });
    for (const periodKey of ["2026-11", "2026-12"]) {
      await db.grantMonthlyCredits({
        userId: user.id,
        subscriptionId: subId,
        tier: "spark",
        periodKey,
        periodEnd: "2027-11-15T00:00:00.000Z",
      });
    }
    // Half the annual charge back: half of each month's 1,000.
    const revoked = await db.revokeAllSubscriptionGrants({
      userId: user.id,
      subscriptionId: subId,
      totalCents: 7988,
      refundedCents: 3994,
    });
    expect(revoked).toEqual({ revoked: true, amount: 1000, periods: 2 });
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 1000, purchased: 0, total: 1000 });
    // Partial refund does NOT stamp refunded_at: the drip continues.
    expect((await db.getSubscriptionByProviderId(subId))?.refunded_at).toBeNull();
    expect((await db.listActiveAnnualSubscriptions()).some((s) => s.lemonsqueezy_subscription_id === subId)).toBe(true);
  });

  it("conversion refuses a user with a monthly grant (post-flag)", async () => {
    const user = await db.createUser(`ledger-convert-monthly-${RUN}@example.com`);
    await db.addUserCredits(user.id, 5);
    await db.grantMonthlyCredits({
      userId: user.id,
      subscriptionId: `sub_convert_monthly-${RUN}`,
      tier: "spark",
      periodKey: "2026-11",
    });
    const refused = await db.convertOraclesToCredits(user.id);
    expect(refused.converted).toBe(false);
    expect(refused.refused).toBe(true);
    expect(refused.refuseReason).toMatch(/monthly/);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 1000, purchased: 5, total: 1005 });
  });

  it("conversion refuses a post-flag purchase and allows a pre-flag one", async () => {
    const user = await db.createUser(`ledger-convert-postflag-${RUN}@example.com`);
    await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: `pack5 (lemonsqueezy:order-convert-postflag-${RUN})`,
      amount: 3.99,
      readings: 5,
      orderId: `order-convert-postflag-${RUN}`,
    });
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 5, total: 5 });
    // The purchase is after a 2000 flip time: refuse, balance unchanged.
    const refused = await db.convertOraclesToCredits(user.id, { flagFlippedAt: "2000-01-01T00:00:00.000Z" });
    expect(refused.converted).toBe(false);
    expect(refused.refused).toBe(true);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 5, total: 5 });
    // The same purchase is before a 2999 flip time: convert normally.
    const done = await db.convertOraclesToCredits(user.id, { flagFlippedAt: "2999-01-01T00:00:00.000Z" });
    expect(done.converted).toBe(true);
    expect(done.credits).toBe(1500);
    expect(await db.getCreditBalances(user.id)).toEqual({ monthly: 0, purchased: 1500, total: 1500 });
  });

  it("listGrantedSubscriptionPeriods returns only the granted months; the drip list pages", async () => {
    const user = await db.createUser(`ledger-periods-${RUN}@example.com`);
    const subId = `sub_periods-${RUN}`;
    await db.upsertSubscription({
      userId: user.id,
      lemonsqueezySubscriptionId: subId,
      lemonsqueezyCustomerId: "7",
      tier: "spark",
      billingInterval: "annual",
      status: "active",
      currentPeriodStart: "2026-11-15T00:00:00.000Z",
      currentPeriodEnd: "2027-11-15T00:00:00.000Z",
      renewsAt: "2027-11-15T00:00:00.000Z",
      endsAt: null,
      cancelAtPeriodEnd: false,
    });
    await db.grantMonthlyCredits({ userId: user.id, subscriptionId: subId, tier: "spark", periodKey: "2026-11" });
    await db.grantMonthlyCredits({ userId: user.id, subscriptionId: subId, tier: "spark", periodKey: "2027-01" });
    expect(await db.listGrantedSubscriptionPeriods(subId)).toEqual(["2026-11", "2027-01"]);
    // Paging: the list is ordered by created_at and the shared
    // ledgers DB holds rows from earlier runs, so assert on shape
    // and on my rows being present, not on page position.
    const all = await db.listActiveAnnualSubscriptions(1000, 0);
    expect(all.some((s) => s.lemonsqueezy_subscription_id === subId)).toBe(true);
    const page1 = await db.listActiveAnnualSubscriptions(1, 0);
    expect(page1).toHaveLength(1);
    const page2 = await db.listActiveAnnualSubscriptions(1, 1);
    expect(page2).toHaveLength(1);
    expect(page2[0].lemonsqueezy_subscription_id).not.toBe(page1[0].lemonsqueezy_subscription_id);
  });

  it("a cancelled row leaves the drip list once a newer live row exists for the user", async () => {
    const user = await db.createUser(`ledger-resub-${RUN}@example.com`);
    const oldId = `sub_resub_old-${RUN}`;
    const newId = `sub_resub_new-${RUN}`;
    await db.upsertSubscription({
      userId: user.id,
      lemonsqueezySubscriptionId: oldId,
      lemonsqueezyCustomerId: "7",
      tier: "spark",
      billingInterval: "annual",
      status: "cancelled",
      currentPeriodStart: "2026-11-15T00:00:00.000Z",
      currentPeriodEnd: "2027-11-15T00:00:00.000Z",
      renewsAt: null,
      endsAt: "2027-11-15T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });
    await db.upsertSubscription({
      userId: user.id,
      lemonsqueezySubscriptionId: newId,
      lemonsqueezyCustomerId: "7",
      tier: "star",
      billingInterval: "annual",
      status: "active",
      currentPeriodStart: "2026-11-16T00:00:00.000Z",
      currentPeriodEnd: "2027-11-16T00:00:00.000Z",
      renewsAt: "2027-11-16T00:00:00.000Z",
      endsAt: null,
      cancelAtPeriodEnd: false,
    });
    const ids = (await db.listActiveAnnualSubscriptions(500, 0)).map((s) => s.lemonsqueezy_subscription_id);
    expect(ids).toContain(newId);
    expect(ids).not.toContain(oldId);
  });

  it("upsert never reassigns a subscription to another user", async () => {
    const u1 = await db.createUser(`ledger-owner1-${RUN}@example.com`);
    const u2 = await db.createUser(`ledger-owner2-${RUN}@example.com`);
    const subId = `sub_owner-${RUN}`;
    await db.upsertSubscription({
      userId: u1.id,
      lemonsqueezySubscriptionId: subId,
      lemonsqueezyCustomerId: "7",
      tier: "spark",
      billingInterval: "monthly",
      status: "active",
      currentPeriodStart: "2026-11-15T00:00:00.000Z",
      currentPeriodEnd: "2026-12-15T00:00:00.000Z",
      renewsAt: "2026-12-15T00:00:00.000Z",
      endsAt: null,
      cancelAtPeriodEnd: false,
    });
    await db.upsertSubscription({
      userId: u2.id,
      lemonsqueezySubscriptionId: subId,
      lemonsqueezyCustomerId: "7",
      tier: "star",
      billingInterval: "monthly",
      status: "active",
      currentPeriodStart: "2026-11-15T00:00:00.000Z",
      currentPeriodEnd: "2026-12-15T00:00:00.000Z",
      renewsAt: "2026-12-15T00:00:00.000Z",
      endsAt: null,
      cancelAtPeriodEnd: false,
    });
    const row = await db.getSubscriptionByProviderId(subId);
    expect(row?.user_id).toBe(u1.id);
    // The tier still updates (only the owner is pinned).
    expect(row?.tier).toBe("star");
  });

  it("the cycle start never moves backward on a late year-1 payment", async () => {
    const user = await db.createUser(`ledger-cycle-${RUN}@example.com`);
    const subId = `sub_cycle-${RUN}`;
    const base = {
      userId: user.id,
      lemonsqueezySubscriptionId: subId,
      lemonsqueezyCustomerId: "7",
      tier: "spark" as const,
      billingInterval: "annual" as const,
      status: "active",
      currentPeriodEnd: "2027-01-15T00:00:00.000Z",
      renewsAt: "2027-01-15T00:00:00.000Z",
      endsAt: null,
      cancelAtPeriodEnd: false,
    };
    await db.upsertSubscription({ ...base, currentPeriodStart: "2026-01-15T00:00:00.000Z" });
    // A late year-1 event carries an earlier start: it must not win.
    await db.upsertSubscription({ ...base, currentPeriodStart: "2025-06-15T00:00:00.000Z" });
    expect((await db.getSubscriptionByProviderId(subId))?.current_period_start).toBe("2026-01-15T00:00:00.000Z");
    // A genuinely later start (a renewal) still moves it forward.
    await db.upsertSubscription({ ...base, currentPeriodStart: "2027-01-15T00:00:00.000Z" });
    expect((await db.getSubscriptionByProviderId(subId))?.current_period_start).toBe("2027-01-15T00:00:00.000Z");
  });
});

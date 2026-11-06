import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";

/**
 * Phase 6 (P1c, gate G2): the money paths EXECUTED against a real
 * Postgres — the readiness review found zero tests exercising the
 * Postgres branch of db.ts (route tests mock it; db-delete.test.ts
 * runs the local-JSON branch only).
 *
 * Runs ONLY when SORTES_TEST_DATABASE_URL is set, against that
 * database (a dedicated local staging database, never production).
 * The suite drops the app tables first, applies the migrations via
 * ensureSchema(), then exercises: webhook fulfilment incl. duplicate
 * delivery, refund revoke incl. double-refund, deleteUser,
 * concurrent spend at balance 1, the follow-up append race, and
 * rollback/retry behaviour.
 *
 *   SORTES_TEST_DATABASE_URL=postgres://sortes_test:sortes_test_local@localhost:5432/sortes_pgtest_money npm test -- src/lib/__tests__/db-postgres.test.ts
 *
 * The password above is for the LOCAL staging database only; it is
 * not a production secret (local Postgres, created by
 * Phase 6 setup, no customer data).
 */
const TEST_URL = process.env.SORTES_TEST_DATABASE_URL ?? "";
const SKIP = !TEST_URL;

type Db = typeof import("@/lib/db");

async function freshDb(): Promise<Db> {
  vi.resetModules();
  (process.env as Record<string, string | undefined>).POSTGRES_URL = TEST_URL;
  delete (process.env as Record<string, string | undefined>).DATABASE_URL;
  return (await import("@/lib/db")) as Db;
}

describe.skipIf(SKIP)("money paths on real Postgres (staging only)", () => {
  let db: Db;
  let raw: postgres.Sql;

  beforeAll(async () => {
    raw = postgres(TEST_URL, { prepare: false, max: 1 });
    // Start from an empty schema in THIS test database only.
    await raw.unsafe(
      `DROP TABLE IF EXISTS schema_migrations, users, auth_codes, transactions, readings, reports, free_interpretations, free_readings CASCADE`
    );
    db = await freshDb();
    await db.ensureSchema();
  }, 30_000);

  afterAll(async () => {
    await raw?.end();
  });

  it("migrations applied: 7 tables, ledger rows, indexes, CHECK constraint", async () => {
    const tables = (await raw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN
        ('users','auth_codes','transactions','readings','reports','free_interpretations','free_readings')
    `) as Array<{ table_name: string }>;
    expect(tables.map((t) => t.table_name).sort()).toEqual(
      ["auth_codes", "free_interpretations", "free_readings", "readings", "reports", "transactions", "users"]
    );
    const ledger = (await raw`SELECT version FROM schema_migrations ORDER BY version`) as Array<{ version: string }>;
    expect(ledger.map((r) => r.version)).toEqual(["001", "002"]);
    const indexes = (await raw`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
        AND indexname LIKE 'idx\_%'`) as Array<{ indexname: string }>;
    expect(indexes.map((i) => i.indexname).sort()).toEqual([
      "idx_readings_user_created",
      "idx_reports_user_created",
      "idx_transactions_pack_type",
      "idx_transactions_user_created",
    ]);
    const checks = (await raw`
      SELECT conname FROM pg_constraint WHERE conname = 'users_credits_nonnegative'`) as Array<{ conname: string }>;
    expect(checks).toHaveLength(1);
    // The CHECK really bites: direct SQL cannot drive a balance negative.
    const user = await db.createUser("check-a@example.com");
    await expect(
      raw.unsafe(`UPDATE users SET credits = -1 WHERE id = '${user.id}'`)
    ).rejects.toThrow(/users_credits_nonnegative/);
  });

  it("fulfillOrder grants once; duplicate delivery is a no-op", async () => {
    const user = await db.createUser("fulfill-a@example.com");
    const args = {
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:order-1001)",
      amount: 3.99,
      readings: 5,
      orderId: "order-1001",
    };
    const first = await db.fulfillOrder(args);
    expect(first.duplicate).toBe(false);
    expect(first.credits).toBe(5);
    const second = await db.fulfillOrder(args);
    expect(second.duplicate).toBe(true);
    expect(second.credits).toBe(5);
    expect((await db.listTransactions(user.id)).filter((t) => t.pack_type.includes("order-1001"))).toHaveLength(1);
    expect((await db.getUserById(user.id))?.credits).toBe(5);
  });

  it("revokeOrder revokes once; a double refund is a no-op", async () => {
    const user = await db.createUser("refund-a@example.com");
    await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: "pack12 (lemonsqueezy:order-1002)",
      amount: 7.99,
      readings: 12,
      orderId: "order-1002",
    });
    expect((await db.getUserById(user.id))?.credits).toBe(12);
    const first = await db.revokeOrder("order-1002");
    expect(first.revoked).toBe(true);
    expect(first.readings).toBe(12);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    const second = await db.revokeOrder("order-1002");
    expect(second.revoked).toBe(false);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    // Refund of an order that was never fulfilled revokes nothing.
    expect(await db.revokeOrder("order-never-existed")).toEqual({ revoked: false, readings: 0 });
  });

  it("a failed fulfilment rolls back fully; retry after the failure succeeds", async () => {
    // Unknown user: fulfillOrder throws inside its transaction.
    await expect(
      db.fulfillOrder({
        userId: "u_does-not-exist",
        email: "ghost@example.com",
        packType: "pack5 (lemonsqueezy:order-1003)",
        amount: 3.99,
        readings: 5,
        orderId: "order-1003",
      })
    ).rejects.toThrow(/User not found during fulfillment/);
    // Nothing was left behind: no transaction row for that order.
    const leftovers = (await raw`
      SELECT id FROM transactions WHERE pack_type LIKE '%order-1003%'`) as unknown as unknown[];
    expect(leftovers).toHaveLength(0);
    // Retry with a real user succeeds (the kill-mid-transaction
    // retry case: Lemon Squeezy redelivers, fulfilment completes).
    const user = await db.createUser("retry-a@example.com");
    const ok = await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:order-1003)",
      amount: 3.99,
      readings: 5,
      orderId: "order-1003",
    });
    expect(ok.duplicate).toBe(false);
    expect(ok.credits).toBe(5);
  });

  it("a simulated crash mid-transaction leaves no partial state", async () => {
    const user = await db.createUser("crash-a@example.com");
    await expect(
      raw.begin(async (tx) => {
        await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
          VALUES ('t_crash', ${user.id}, ${user.email}, 'pack5 (lemonsqueezy:order-1004)', 3.99, 5, NOW())`;
        await tx`UPDATE users SET credits = credits + 5 WHERE id = ${user.id}`;
        throw new Error("simulated crash between the two writes");
      })
    ).rejects.toThrow(/simulated crash/);
    const rows = (await raw`
      SELECT id FROM transactions WHERE pack_type LIKE '%order-1004%'`) as unknown as unknown[];
    expect(rows).toHaveLength(0);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
  });

  it("concurrent spendUserCredits at balance 1: exactly one succeeds", async () => {
    const user = await db.createUser("race-a@example.com");
    await db.addUserCredits(user.id, 1);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => db.spendUserCredits(user.id, 1))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
  });

  it("concurrent follow-up appends at the cap: one wins, one gets limit, one spend only", async () => {
    const user = await db.createUser("race-b@example.com");
    await db.addUserCredits(user.id, 2);
    await db.saveReadingForUser(user.id, { id: "r-race-1", question: "q?" });
    // Two follow-ups already on the reading: only one slot left.
    await db.appendFollowUpWithSpend(user.id, "r-race-1", { question: "q1", answer: "a1" }, 1);
    await db.appendFollowUpWithSpend(user.id, "r-race-1", { question: "q2", answer: "a2" }, 1);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    await db.addUserCredits(user.id, 2);
    const results = await Promise.all([
      db.appendFollowUpWithSpend(user.id, "r-race-1", { question: "q3", answer: "a3" }, 1),
      db.appendFollowUpWithSpend(user.id, "r-race-1", { question: "q4", answer: "a4" }, 1),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const limitCount = results.filter((r) => !r.ok && r.reason === "limit").length;
    expect(okCount).toBe(1);
    expect(limitCount).toBe(1);
    expect((await db.getUserById(user.id))?.credits).toBe(1);
    const stored = (await db.getReadingForUser(user.id, "r-race-1")) as { followUps?: unknown[] };
    expect(stored.followUps).toHaveLength(3);
  });

  it("deleteUser removes everything on Postgres and leaves other users alone", async () => {
    const userA = await db.createUser("del-a@example.com");
    const userB = await db.createUser("del-b@example.com");
    await db.addUserCredits(userA.id, 5);
    await db.saveReadingForUser(userA.id, { id: "r-del-a", question: "q?" });
    await db.saveReportForUser(userA.id, { id: "rep-del-a", title: "Report A" });
    await db.saveReadingForUser(userB.id, { id: "r-del-b", question: "q?" });
    await db.createTransaction({ userId: userA.id, email: userA.email, packType: "pack-5", amount: 3.99, readings: 5 });
    await db.markFreeReadingUsed(userA.id);
    await db.markFreeInterpretationUsed(userA.id, "western");
    await db.storeAuthCode(userA.email, "hash-a", new Date(Date.now() + 600000));

    expect(await db.deleteUser(userA.id)).toBe(true);
    expect(await db.getUserById(userA.id)).toBeNull();
    expect(await db.listReadingsForUser(userA.id)).toHaveLength(0);
    expect(await db.listReportsForUser(userA.id)).toHaveLength(0);
    expect(await db.listTransactions(userA.id)).toHaveLength(0);
    expect(await db.hasUsedFreeReading(userA.id)).toBe(false);
    expect(await db.hasUsedFreeInterpretation(userA.id, "western")).toBe(false);
    expect(await db.getAuthCode(userA.email)).toBeNull();

    expect(await db.getUserById(userB.id)).not.toBeNull();
    expect(await db.listReadingsForUser(userB.id)).toHaveLength(1);
    expect(await db.deleteUser("u_does-not-exist")).toBe(false);
  });
});

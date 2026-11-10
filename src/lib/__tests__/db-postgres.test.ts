import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { pgTestUrl } from "./pg-test-url";

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
 *   SORTES_TEST_DATABASE_URL=postgres://sortes_test:<local-password>@127.0.0.1:5432/sortes_pgtest_money
 *
 * (Local-only staging password: keep the real value out of the repo;
 * set it in your shell when running the suite.)
 */
const TEST_URL = pgTestUrl("SORTES_TEST_DATABASE_URL");
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
    expect(ledger.map((r) => r.version)).toEqual(["001", "002", "003", "006", "007"]);
    const indexes = (await raw`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
        AND indexname LIKE 'idx\_%'`) as Array<{ indexname: string }>;
    expect(indexes.map((i) => i.indexname).sort()).toEqual([
      "idx_readings_user_created",
      "idx_reports_user_created",
      "idx_transactions_order_id_unique",
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
    // Phase B (R5): migration 006 added the session-version column;
    // a new user starts at version 1, which is also the value a
    // legacy token (no pwdVer claim) is read as.
    const cols = (await raw`
      SELECT column_name, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'pwd_ver'`) as Array<{ column_name: string; column_default: string }>;
    expect(cols).toHaveLength(1);
    expect(cols[0].column_default).toBe("1");
    const ver = (await raw`SELECT pwd_ver FROM users WHERE id = ${user.id}`) as Array<{ pwd_ver: number }>;
    expect(ver[0].pwd_ver).toBe(1);
  });

  it("Phase G (F11): the live app role passes the RLS role assertion", async () => {
    // beforeAll already ran ensureSchema(), which now asserts the
    // role itself; this test pins the live role explicitly so the
    // assertion is proven against a real connection, not only by
    // the suite not failing.
    const [{ current_user }] = (await raw`SELECT current_user`) as Array<{ current_user: string }>;
    expect(current_user).not.toMatch(/^(anon|authenticated)$/i);
    expect(() => db.assertAppDbRole(current_user)).not.toThrow();
    // Phase G follow-up: F11 is an allowlist, not a denylist. The
    // live role (sortes_test here) is on it; the Supabase pooler
    // user form is on it; anything else, including a hypothetical
    // dedicated app role, is refused.
    expect(() => db.assertAppDbRole("postgres.abcdefghijklmnop")).not.toThrow();
    expect(() => db.assertAppDbRole("sortes_app")).toThrow();
    expect(() => db.assertAppDbRole("app_user")).toThrow();
    expect(() => db.assertAppDbRole("anon")).toThrow();
    expect(() => db.assertAppDbRole("authenticated")).toThrow();
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

  it("concurrent duplicate fulfilment: two simultaneous deliveries grant once", async () => {
    // Phase 6B: only sequential duplicates were tested before. Two
    // identical webhook deliveries arriving at the same time must
    // still grant exactly once (row lock + in-transaction dup check).
    const user = await db.createUser("fulfill-b@example.com");
    const args = {
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:order-1001b)",
      amount: 3.99,
      readings: 5,
      orderId: "order-1001b",
    };
    const results = await Promise.all([db.fulfillOrder(args), db.fulfillOrder(args)]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect((await db.getUserById(user.id))?.credits).toBe(5);
    expect((await db.listTransactions(user.id)).filter((t) => t.pack_type.includes("order-1001b"))).toHaveLength(1);
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

  it("audit item 10: partial refund revokes only the prorated Oracles, cumulatively and idempotently", async () => {
    const user = await db.createUser("refund-prorate@example.com");
    await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: "pack12 (lemonsqueezy:order-1010)",
      amount: 7.99,
      readings: 12,
      orderId: "order-1010",
    });
    // $4.00 of $7.99 refunded: floor(12 * 400 / 799) = 6 Oracles.
    const part = await db.revokeOrder("order-1010", "", 400);
    expect(part).toEqual({ revoked: true, readings: 6 });
    expect((await db.getUserById(user.id))?.credits).toBe(6);
    // Redelivery of the same refund revokes nothing more.
    expect((await db.revokeOrder("order-1010", "", 400)).revoked).toBe(false);
    expect((await db.getUserById(user.id))?.credits).toBe(6);
    // Cumulative refund now the full $7.99: only the remaining 6 go.
    expect(await db.revokeOrder("order-1010", "", 799)).toEqual({ revoked: true, readings: 6 });
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    expect((await db.revokeOrder("order-1010", "", 799)).revoked).toBe(false);
  });

  it("audit item 10: full or oversized refund revokes the whole pack once", async () => {
    const user = await db.createUser("refund-full@example.com");
    await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:order-1011)",
      amount: 3.99,
      readings: 5,
      orderId: "order-1011",
    });
    expect(await db.revokeOrder("order-1011", "", 99999)).toEqual({ revoked: true, readings: 5 });
    expect((await db.getUserById(user.id))?.credits).toBe(0);
  });

  it("Phase G follow-up: refund before fulfilment records a marker; a later fulfilment grants nothing", async () => {
    // The refund webhook can arrive before the order_created
    // webhook (out-of-order delivery). The refund must leave a
    // record even though there is no fulfilment to revoke yet, so
    // the later fulfilment sees it and grants nothing.
    const user = await db.createUser("refund-first-a@example.com");
    const args = {
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:order-1005)",
      amount: 3.99,
      readings: 5,
      orderId: "order-1005",
    };
    // Refund first: nothing to revoke, but the marker is recorded.
    expect(await db.revokeOrder("order-1005")).toEqual({ revoked: false, readings: 0 });
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    // A second refund records no second marker.
    expect(await db.revokeOrder("order-1005")).toEqual({ revoked: false, readings: 0 });
    const markerRows = (await raw`
      SELECT readings FROM transactions WHERE pack_type LIKE '%order-1005%'`) as Array<{ readings: number }>;
    expect(markerRows).toHaveLength(1);
    expect(markerRows[0].readings).toBe(0);
    // The late order_created must NOT grant.
    const late = await db.fulfillOrder(args);
    expect(late.duplicate).toBe(true);
    expect(late.credits).toBe(0);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    // No fulfilment row was written: still exactly the one marker.
    const afterRows = (await raw`
      SELECT readings FROM transactions WHERE pack_type LIKE '%order-1005%'`) as Array<{ readings: number }>;
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].readings).toBe(0);
    expect((await db.listTransactions(user.id)).filter((t) => t.pack_type.includes("order-1005"))).toHaveLength(0);
  });

  it("concurrent double refund: two simultaneous revokes revoke once", async () => {
    // Phase 6B: only sequential double refunds were tested before.
    const user = await db.createUser("refund-b@example.com");
    await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: "pack12 (lemonsqueezy:order-1002b)",
      amount: 7.99,
      readings: 12,
      orderId: "order-1002b",
    });
    const results = await Promise.all([db.revokeOrder("order-1002b"), db.revokeOrder("order-1002b")]);
    expect(results.filter((r) => r.revoked)).toHaveLength(1);
    expect(results.filter((r) => !r.revoked)).toHaveLength(1);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    const refundRows = (await raw`
      SELECT id FROM transactions WHERE pack_type LIKE '%order-1002b:refund%'`) as unknown as unknown[];
    expect(refundRows).toHaveLength(1);
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

  it("Phase B (F4): concurrent first follow-up appends: one is free, one is charged", async () => {
    const user = await db.createUser("race-f4@example.com");
    await db.addUserCredits(user.id, 1);
    await db.saveReadingForUser(user.id, { id: "r-race-f4", question: "q?" });
    const results = await Promise.all([
      db.appendFollowUpWithSpend(
        user.id,
        "r-race-f4",
        { question: "q1", answer: "a1", free: true },
        0,
        3,
        true
      ),
      db.appendFollowUpWithSpend(
        user.id,
        "r-race-f4",
        { question: "q2", answer: "a2", free: true },
        0,
        3,
        true
      ),
    ]);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    const freeResults = results.filter((r) => r.free === true);
    const chargedResults = results.filter((r) => r.free === false);
    expect(freeResults).toHaveLength(1);
    expect(chargedResults).toHaveLength(1);
    const stored = (await db.getReadingForUser(user.id, "r-race-f4")) as {
      followUps?: Array<{ question: string; answer: string; free: boolean }>;
    };
    expect(stored.followUps).toHaveLength(2);
    const storedFreeCount = (stored.followUps ?? []).filter((f) => f.free === true).length;
    const storedChargedCount = (stored.followUps ?? []).filter((f) => f.free === false).length;
    expect(storedFreeCount).toBe(1);
    expect(storedChargedCount).toBe(1);
    expect((await db.getUserById(user.id))?.credits).toBe(0);
  });

  it("Phase B (R10): spendUserCredits rejects zero and negative amounts on Postgres", async () => {
    const user = await db.createUser("spend-guard-a@example.com");
    await db.addUserCredits(user.id, 3);
    await expect(db.spendUserCredits(user.id, 0)).rejects.toThrow(/positive/);
    await expect(db.spendUserCredits(user.id, -5)).rejects.toThrow(/positive/);
    // A negative spend would have ADDED credits; the balance is untouched.
    expect((await db.getUserById(user.id))?.credits).toBe(3);
    expect(await db.spendUserCredits(user.id, 1)).toBe(true);
    expect((await db.getUserById(user.id))?.credits).toBe(2);
  });

  it("Phase B (R7): concurrent free-use claims grant exactly once", async () => {
    const user = await db.createUser("race-free-a@example.com");
    const readingClaims = await Promise.all(
      Array.from({ length: 5 }, () => db.markFreeReadingUsed(user.id))
    );
    expect(readingClaims.filter(Boolean)).toHaveLength(1);
    expect(await db.hasUsedFreeReading(user.id)).toBe(true);
    expect(await db.markFreeReadingUsed(user.id)).toBe(false);
    const interpClaims = await Promise.all(
      Array.from({ length: 5 }, () => db.markFreeInterpretationUsed(user.id, "western"))
    );
    expect(interpClaims.filter(Boolean)).toHaveLength(1);
    expect(await db.hasUsedFreeInterpretation(user.id, "western")).toBe(true);
    // A different system is an independent claim.
    expect(await db.markFreeInterpretationUsed(user.id, "vedic")).toBe(true);
  });

  it("Phase B (R5): setUserPassword bumps the session version", async () => {
    const user = await db.createUserWithPassword("pwdver-a@example.com", "salt:hash");
    expect(user?.pwd_ver).toBe(1);
    expect(await db.setUserPassword(user!.id, "salt:hash2")).toBe(2);
    expect((await db.getUserById(user!.id))?.pwd_ver).toBe(2);
    expect(await db.setUserPassword(user!.id, "salt:hash3")).toBe(3);
    // A passwordless account also starts at version 1.
    const plain = await db.createUser("pwdver-b@example.com");
    expect(plain.pwd_ver).toBe(1);
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

  it("AF-004: fulfilled orders carry a DB-level UNIQUE order_id", async () => {
    const user = await db.createUser("af004-a@example.com");
    const res = await db.fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:af004-order)",
      amount: 3.99,
      readings: 5,
      orderId: "af004-order",
    });
    expect(res.duplicate).toBe(false);
    const stored = (await raw`SELECT order_id FROM transactions WHERE id = ${res.transaction!.id}`) as Array<{ order_id: string | null }>;
    expect(stored[0].order_id).toBe("af004-order");
    // Direct SQL cannot create a second row for the same order.
    await expect(
      raw`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at, order_id)
        VALUES (${"t_af004_dup"}, ${user.id}, ${user.email}, ${"pack5 (lemonsqueezy:af004-order)"}, 3.99, 5, NOW(), ${"af004-order"})`
    ).rejects.toThrow(/idx_transactions_order_id_unique|unique/i);
  });

  it("Phase B (F5): prefix orderId is not treated as a duplicate (anchored pattern)", async () => {
    const user = await db.createUser("prefix-a@example.com");
    const order1234 = {
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:order-1234)",
      amount: 3.99,
      readings: 5,
      orderId: "order-1234",
    };
    const first = await db.fulfillOrder(order1234);
    expect(first.duplicate).toBe(false);
    expect(first.credits).toBe(5);

    // Fulfilling "order-123" (a strict prefix of "order-1234") is a
    // distinct order, not a duplicate: the ")" anchor in the LIKE
    // pattern keeps the two apart.
    const order123 = {
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:order-123)",
      amount: 3.99,
      readings: 5,
      orderId: "order-123",
    };
    const second = await db.fulfillOrder(order123);
    expect(second.duplicate).toBe(false);
    expect(second.credits).toBe(10);
    expect((await db.getUserById(user.id))?.credits).toBe(10);

    // Actual duplicate delivery of order-123 is rejected.
    const duplicateDelivery = await db.fulfillOrder(order123);
    expect(duplicateDelivery.duplicate).toBe(true);
    expect(duplicateDelivery.credits).toBe(10);

    // Revoking order-123 removes only its own grant (5), not
    // order-1234's: the fulfilment lookup is anchored the same way.
    const revoke123 = await db.revokeOrder("order-123");
    expect(revoke123).toEqual({ revoked: true, readings: 5 });
    expect((await db.getUserById(user.id))?.credits).toBe(5);

    // Double refund of order-123 is a no-op (anchored refund marker).
    const revoke123Again = await db.revokeOrder("order-123");
    expect(revoke123Again.revoked).toBe(false);

    // After a refund, a redelivered order_created is treated as duplicate
    // and is not re-granted.
    const redeliveredAfterRefund = await db.fulfillOrder(order123);
    expect(redeliveredAfterRefund.duplicate).toBe(true);
    expect(redeliveredAfterRefund.credits).toBe(5);
    expect((await db.getUserById(user.id))?.credits).toBe(5);

    // Prefix revoke probe, last: revoking "order-12" (a strict prefix
    // of both fulfilled orders, itself never fulfilled) revokes
    // nothing and leaves both grants untouched. It records a
    // pending-refund marker for order-12 (Phase G follow-up), which
    // is why this probe runs on an id that is never fulfilled
    // afterwards: a recorded refund for an order blocks its later
    // fulfilment by design, so the probe must not name an order
    // this test still intends to fulfil (see the refund-before-
    // fulfilment test above).
    const revokePrefix = await db.revokeOrder("order-12");
    expect(revokePrefix).toEqual({ revoked: false, readings: 0 });
    expect((await db.getUserById(user.id))?.credits).toBe(5);
  });
  // Item 3: spend/free-claim and the reading row commit together.
  it("saveReadingWithSpend: one transaction for spend + row; free claim; no credit writes nothing", async () => {
    const user = await db.createUser("save-spend@example.com");
    await db.addUserCredits(user.id, 1);
    const r = (id: string) => ({ id, free: false, interpretation: "text", aiGenerated: true });
    // First free: claims free_readings, spends nothing, row has free:true.
    expect(await db.saveReadingWithSpend(user.id, r("sws-1"), true)).toEqual({ ok: true, free: true });
    expect((await db.getUserById(user.id))?.credits).toBe(1);
    // Free already used: falls back to a 1-Oracle spend, row free:false.
    expect(await db.saveReadingWithSpend(user.id, r("sws-2"), true)).toEqual({ ok: true, free: false });
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    // No credit: nothing written (no row, no spend).
    expect(await db.saveReadingWithSpend(user.id, r("sws-3"), false)).toEqual({ ok: false, free: false });
    const rows = (await raw`SELECT id, data->>'free' AS free FROM readings WHERE user_id = ${user.id} ORDER BY id`) as Array<{ id: string; free: string }>;
    expect(rows).toEqual([{ id: "sws-1", free: "true" }, { id: "sws-2", free: "false" }]);
  });
  // Batch D (B1): regression guard. The first-ever reading being a Celtic
  // Cross (tryFree=false) spends 1 and leaves the free grant intact.
  it("B1: first Celtic Cross spends 1 and does not consume the free grant", async () => {
    const user = await db.createUser("bd-b1@example.com");
    await db.addUserCredits(user.id, 3);
    const r = (id: string) => ({ id, free: false, interpretation: "text", aiGenerated: true });
    expect(await db.hasUsedFreeReading(user.id)).toBe(false);
    expect(await db.saveReadingWithSpend(user.id, r("bd-cc"), false)).toEqual({ ok: true, free: false });
    expect((await db.getUserById(user.id))?.credits).toBe(2);
    expect(await db.hasUsedFreeReading(user.id)).toBe(false);
    expect(await db.saveReadingWithSpend(user.id, r("bd-qi"), true)).toEqual({ ok: true, free: true });
    expect((await db.getUserById(user.id))?.credits).toBe(2);
  });

  // Batch D (B2): the client's /api/history save with the server's id is a no-op.
  it("B2: client re-save of a server-saved reading id leaves exactly one row", async () => {
    const user = await db.createUser("bd-b2@example.com");
    await db.addUserCredits(user.id, 1);
    const r = { id: "bd-srv", free: false, interpretation: "text", aiGenerated: true };
    expect((await db.saveReadingWithSpend(user.id, r, false)).ok).toBe(true);
    await db.saveReadingForUser(user.id, { ...r, interpretation: "client copy" });
    const rows = (await raw`SELECT data->>'interpretation' AS t FROM readings WHERE id = 'bd-srv'`) as Array<{ t: string }>;
    expect(rows).toEqual([{ t: "text" }]);
  });

  // Batch D (B4): report spend + row are one transaction.
  it("B4: saveReportWithSpend spends 1 with the row; no credit writes nothing; re-save is a no-op", async () => {
    const user = await db.createUser("bd-b4r@example.com");
    expect(await db.saveReportWithSpend(user.id, { id: "bd-rep-0", interpretation: "x" })).toEqual({ ok: false });
    expect((await raw`SELECT id FROM reports WHERE user_id = ${user.id}`).length).toBe(0);
    await db.addUserCredits(user.id, 1);
    expect(await db.saveReportWithSpend(user.id, { id: "bd-rep-1", interpretation: "x" })).toEqual({ ok: true });
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    await db.saveReportForUser(user.id, { id: "bd-rep-1", interpretation: "client copy" });
    expect((await raw`SELECT id FROM reports WHERE user_id = ${user.id}`).length).toBe(1);
    expect(await db.saveReportWithSpend(user.id, { id: "bd-rep-2", interpretation: "y" })).toEqual({ ok: false });
    expect((await raw`SELECT id FROM reports WHERE user_id = ${user.id}`).length).toBe(1);
  });

  // Batch D (B4): chart interpretation = reading row + per-system free claim in one transaction.
  it("B4: chart interpretation claims the per-system free use, then spends; no credit writes nothing", async () => {
    const user = await db.createUser("bd-b4c@example.com");
    const r = (id: string) => ({ id, free: false, interpretation: "text", aiGenerated: true });
    expect(await db.saveReadingWithSpend(user.id, r("bd-ch-1"), true, "western")).toEqual({ ok: true, free: true });
    expect(await db.hasUsedFreeInterpretation(user.id, "western")).toBe(true);
    expect(await db.hasUsedFreeInterpretation(user.id, "vedic")).toBe(false);
    expect(await db.hasUsedFreeReading(user.id)).toBe(false);
    expect(await db.saveReadingWithSpend(user.id, r("bd-ch-2"), true, "western")).toEqual({ ok: false, free: false });
    await db.addUserCredits(user.id, 1);
    expect(await db.saveReadingWithSpend(user.id, r("bd-ch-3"), true, "western")).toEqual({ ok: true, free: false });
    expect((await db.getUserById(user.id))?.credits).toBe(0);
    const rows = (await raw`SELECT id FROM readings WHERE user_id = ${user.id} ORDER BY id`) as Array<{ id: string }>;
    expect(rows.map((x) => x.id)).toEqual(["bd-ch-1", "bd-ch-3"]);
  });

  // Item 2: a guest reading synced on sign-in (POST /api/history -> saveReadingForUser,
  // keeping its local id) is the row the follow-up route finds by that same id.
  it("item 2: a reading synced under its local id accepts a follow-up for that id", async () => {
    const user = await db.createUser("item2-sync@example.com");
    const other = await db.createUser("item2-other@example.com");
    await db.addUserCredits(user.id, 1);
    const local = { id: "guest-local-id-X", question: "q?", interpretation: "text", aiGenerated: true, free: true };
    await db.saveReadingForUser(user.id, local); // what migrateGuestData -> /api/history does
    await db.saveReadingForUser(user.id, local); // re-sync is a no-op (ON CONFLICT DO NOTHING)
    expect((await raw`SELECT id FROM readings WHERE id = ${local.id}`).length).toBe(1);
    const res = await db.appendFollowUpWithSpend(user.id, local.id, { question: "more?", answer: "a", free: true }, 0, 3, true);
    expect(res.ok).toBe(true);
    expect(res.followUps).toHaveLength(1);
    const stored = (await db.getReadingForUser(user.id, local.id)) as { followUps?: unknown[] };
    expect(stored.followUps).toHaveLength(1);
    // Another account cannot follow up on it (the route's "not found").
    expect((await db.appendFollowUpWithSpend(other.id, local.id, { question: "x", answer: "y", free: true }, 0, 3, true)).ok).toBe(false);
  });
});

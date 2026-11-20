import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { pgTestUrl } from "./pg-test-url";
import { CREDIT_COSTS_ENABLED, ORACLE_TO_CREDITS } from "@/lib/subscription-tiers";

/**
 * Cutover prep (2026-11-20): end-to-end tests for the conversion
 * runner (scripts/convert-oracles.mjs) and the census
 * (scripts/census-oracles.mjs), run as real child processes against
 * real Postgres. Runs ONLY when SORTES_TEST_DATABASE_URL_LEDGERS is
 * set (pgTestUrl: skips locally without it, throws under CI).
 *
 * Own database: the runner converts EVERY holder in the database it
 * is pointed at, and db-credit-ledgers.test.ts seeds holders in the
 * ledgers DB in parallel (vitest runs files concurrently) — a live
 * run there would convert that suite's users mid-test. So this suite
 * drops and re-creates a sibling database, sortes_pgtest_convert, on
 * the same server as the LEDGERS URL (the test role has CREATEDB
 * locally and is the superuser in CI). Fresh each run, so the totals
 * below are exact.
 *
 * --live runs here set SORTES_CONVERT_ALLOW_FLAG_OFF=1 so the suite
 * also runs on a flag-OFF checkout (the override is refused on
 * production URLs; that refusal is tested below while the flag is OFF).
 * Since the credit cutover the flag is ON, so the override is unused.
 */
const LEDGERS_URL = pgTestUrl("SORTES_TEST_DATABASE_URL_LEDGERS");
const SKIP = !LEDGERS_URL;
const CONVERT_DB = "sortes_pgtest_convert";
const CONVERT_URL = (() => {
  if (!LEDGERS_URL) return "";
  const u = new URL(LEDGERS_URL);
  u.pathname = `/${CONVERT_DB}`;
  return u.toString();
})();

const ROOT = path.resolve(__dirname, "../../..");
const RUNNER = path.join(ROOT, "scripts/convert-oracles.mjs");
const CENSUS = path.join(ROOT, "scripts/census-oracles.mjs");
// Before every seeded purchase except the deliberate post-flag one,
// and in the past (the runner refuses a future flip time).
const FLIP = "2026-01-01T00:00:00.000Z";

type Db = typeof import("@/lib/db");

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown> | null;
}

function run(script: string, args: string[], env: Record<string, string | undefined> = {}): RunResult {
  const childEnv: Record<string, string | undefined> = { ...process.env, NODE_ENV: "test", POSTGRES_URL: CONVERT_URL };
  delete childEnv.DATABASE_URL;
  delete childEnv.SORTES_CONVERT_PRODUCTION;
  delete childEnv.SORTES_CENSUS_PRODUCTION;
  delete childEnv.SORTES_CONVERT_ALLOW_FLAG_OFF;
  Object.assign(childEnv, env);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: childEnv as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout: 60_000,
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = null;
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

const runLive = (args: string[] = ["--flag-flipped-at", FLIP], env: Record<string, string> = {}) =>
  run(RUNNER, ["--live", ...args], { SORTES_CONVERT_ALLOW_FLAG_OFF: "1", ...env });

describe.skipIf(SKIP)("Oracle conversion runner + census on real Postgres (local test DB only)", () => {
  let db: Db;
  let raw: postgres.Sql;
  const ids: Record<string, string> = {};

  async function balances(id: string) {
    const [row] = (await raw`SELECT monthly_credits, purchased_credits, credits FROM users WHERE id = ${id}`) as Array<{
      monthly_credits: number;
      purchased_credits: number;
      credits: number;
    }>;
    return { monthly: row.monthly_credits, purchased: row.purchased_credits, total: row.credits };
  }
  async function conversionGrants(id?: string) {
    return (await raw`SELECT user_id, amount FROM credit_grants WHERE kind = 'conversion'
      ${id ? raw`AND user_id = ${id}` : raw``}`) as Array<{ user_id: string; amount: number }>;
  }
  async function conversionTxs(id?: string) {
    return (await raw`SELECT user_id, readings, amount FROM transactions WHERE pack_type = 'oracle-conversion'
      ${id ? raw`AND user_id = ${id}` : raw``}`) as Array<{ user_id: string; readings: number; amount: string }>;
  }

  beforeAll(async () => {
    const admin = postgres(LEDGERS_URL, { prepare: false, max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${CONVERT_DB} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${CONVERT_DB}`);
    await admin.end();
    raw = postgres(CONVERT_URL, { prepare: false, max: 1, onnotice: () => {} });
    vi.resetModules();
    (process.env as Record<string, string | undefined>).POSTGRES_URL = CONVERT_URL;
    delete (process.env as Record<string, string | undefined>).DATABASE_URL;
    db = (await import("@/lib/db")) as Db;
    await db.ensureSchema();

    // A: plain Oracle holder (balance with no purchase row, like a
    //    migration-008 backfill) -> converts 7 -> 2,100.
    const a = await db.createUser("convert-a@example.com");
    await db.addUserCredits(a.id, 7);
    // Credit cutover: the flag is ON in this checkout now, and a pack
    // fulfilled through the default "oracles" unit would be granted
    // x300. These seeds reproduce the pre-cutover state (the pack's
    // Oracle count stored as-is), so they pass grantUnit "credits",
    // which grants the given amount unchanged.
    // C: bought a pack AFTER the flip -> refused (already credits).
    const c = await db.createUser("convert-c@example.com");
    await db.fulfillOrder({
      userId: c.id,
      email: c.email,
      packType: "pack5 (lemonsqueezy:order-convert-c)",
      amount: 3.99,
      readings: 5,
      orderId: "order-convert-c",
      grantUnit: "credits",
    });
    // D: bought a pack BEFORE the flip -> converts 12 -> 3,600.
    const d = await db.createUser("convert-d@example.com");
    await db.fulfillOrder({
      userId: d.id,
      email: d.email,
      packType: "pack12 (lemonsqueezy:order-convert-d)",
      amount: 7.99,
      readings: 12,
      orderId: "order-convert-d",
      grantUnit: "credits",
    });
    await raw`UPDATE transactions SET created_at = '2025-06-01T00:00:00Z' WHERE order_id = 'order-convert-d'`;
    // Z: zero balance -> not in the population at all.
    const z = await db.createUser("convert-z@example.com");
    Object.assign(ids, { a: a.id, c: c.id, d: d.id, z: z.id });
  }, 60_000);

  afterAll(async () => {
    await raw?.end();
  });

  it("census: holders, totals, and per-user rows (clean pre-cutover state)", () => {
    const r = run(CENSUS, []);
    expect(r.status, r.stderr).toBe(0);
    const c = r.json!;
    expect(Object.keys(c).sort()).toEqual(
      [
        "alreadyConverted",
        "alreadyConvertedCredits",
        "database",
        "holders",
        "takenAt",
        "totalCreditsAfterConversion",
        "totalMonthlyCredits",
        "totalOracles",
        "unconvertedHolders",
        "users",
        "usersWithMonthlyCredits",
        "warnings",
      ].sort()
    );
    expect(c.database).toMatch(new RegExp(`/${CONVERT_DB}$`));
    expect(c.holders).toBe(3);
    expect(c.totalOracles).toBe(7 + 5 + 12);
    // The census's own rate constant is pinned to the app's.
    expect(c.totalCreditsAfterConversion).toBe((7 + 5 + 12) * ORACLE_TO_CREDITS);
    expect(c.totalMonthlyCredits).toBe(0);
    expect(c.usersWithMonthlyCredits).toBe(0);
    expect(c.alreadyConverted).toBe(0);
    expect(c.alreadyConvertedCredits).toBe(0);
    expect(c.unconvertedHolders).toBe(3);
    expect(c.warnings).toEqual([]);
    expect(c.users).toEqual([
      { id: ids.a, email: "convert-a@example.com", purchased_credits: 7, monthly_credits: 0, converted: false },
      { id: ids.c, email: "convert-c@example.com", purchased_credits: 5, monthly_credits: 0, converted: false },
      { id: ids.d, email: "convert-d@example.com", purchased_credits: 12, monthly_credits: 0, converted: false },
    ]);
    expect(r.stderr).toMatch(/CENSUS on .*: 3 holder\(s\), 24 Oracles \(= 7200 credits/);
  });

  it("census flags monthly credits (exit 1, warning) once a subscription grant exists", async () => {
    // B: Oracle holder who also has a monthly (subscription) grant.
    const b = await db.createUser("convert-b@example.com");
    await db.addUserCredits(b.id, 5);
    await db.grantMonthlyCredits({ userId: b.id, subscriptionId: "sub_convert_b", tier: "spark", periodKey: "2026-11" });
    ids.b = b.id;
    const r = run(CENSUS, []);
    expect(r.status).toBe(1);
    expect(r.json!.holders).toBe(4);
    expect(r.json!.totalOracles).toBe(29);
    expect(r.json!.totalMonthlyCredits).toBe(1000);
    expect(r.json!.usersWithMonthlyCredits).toBe(1);
    expect((r.json!.warnings as string[]).join(" ")).toMatch(/monthly_credits total is 1000/);
    expect(r.stderr).toMatch(/WARNING/);
  });

  it("missing / invalid --flag-flipped-at (and other bad usage) exits 2 before any conversion", async () => {
    const bad: string[][] = [
      [], // no flip time
      ["--flag-flipped-at"], // flag without a value
      ["--flag-flipped-at", "yesterday"],
      ["--flag-flipped-at", "2026-11-20"], // date only, no time/zone
      ["--flag-flipped-at", "2026-11-20T01:00:00"], // no zone
      ["--flag-flipped-at", "2026-13-45T99:00:00Z"], // not a real time
      ["--flag-flipped-at", "2999-01-01T00:00:00Z"], // future: would disable the guard
      ["--flag-flipped-at", FLIP, "--bogus"],
    ];
    for (const args of bad) {
      const r = runLive(args);
      expect(r.status, `args ${JSON.stringify(args)}: ${r.stderr}`).toBe(2);
      expect(r.stdout).toBe("");
      expect(r.stderr).toMatch(/Usage:/);
    }
    // Mode is required and exclusive.
    expect(run(RUNNER, ["--flag-flipped-at", FLIP]).status).toBe(2);
    expect(run(RUNNER, ["--flag-flipped-at", FLIP, "--dry-run", "--live"]).status).toBe(2);
    // Nothing converted, nothing changed.
    expect(await conversionGrants()).toEqual([]);
    expect(await conversionTxs()).toEqual([]);
    expect(await balances(ids.a)).toEqual({ monthly: 0, purchased: 7, total: 7 });
  });

  // Credit cutover: the flag is ON in this checkout now, so the runner's
  // flag-OFF refusal cannot be reached from here. The check stays in the
  // runner (a rollback to flag OFF re-arms it) and this test runs again
  // on any flag-OFF checkout.
  it.skipIf(CREDIT_COSTS_ENABLED)("--live refuses while CREDIT_COSTS_ENABLED is false unless the local-only override is set", async () => {
    const r = run(RUNNER, ["--live", "--flag-flipped-at", FLIP]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/CREDIT_COSTS_ENABLED is false/);
    expect(await conversionGrants()).toEqual([]);
  });

  it("both scripts refuse a production-looking URL without their explicit env flag (no connection made)", () => {
    const prod = "postgres://postgres:not-a-real-password@db.example-ref.supabase.co:5432/postgres";
    const conv = run(RUNNER, ["--dry-run", "--flag-flipped-at", FLIP], { POSTGRES_URL: prod });
    expect(conv.status).toBe(2);
    expect(conv.stderr).toMatch(/SORTES_CONVERT_PRODUCTION=1/);
    const census = run(CENSUS, [], { POSTGRES_URL: prod });
    expect(census.status).toBe(2);
    expect(census.stderr).toMatch(/SORTES_CENSUS_PRODUCTION=1/);
    // Even with the production flag, the flag-OFF override is refused
    // on a production URL (exits before connecting). Only reachable
    // while the flag is OFF: with it ON (the cutover), the runner would
    // go on to connect, so this part is skipped rather than letting a
    // test dial the fake production host.
    if (CREDIT_COSTS_ENABLED) return;
    const override = run(RUNNER, ["--live", "--flag-flipped-at", FLIP], {
      POSTGRES_URL: prod,
      SORTES_CONVERT_PRODUCTION: "1",
      SORTES_CONVERT_ALLOW_FLAG_OFF: "1",
    });
    expect(override.status).toBe(2);
    expect(override.stderr).toMatch(/CREDIT_COSTS_ENABLED is false/);
  });

  it("--dry-run lists the would-be conversions and converts nothing", async () => {
    const r = run(RUNNER, ["--dry-run", "--flag-flipped-at", FLIP]);
    expect(r.status, r.stderr).toBe(0);
    const s = r.json!;
    expect(s.mode).toBe("dry-run");
    expect(s.flagFlippedAt).toBe(FLIP);
    expect(s.holders).toBe(4);
    expect(s.wouldConvertCount).toBe(4);
    expect(s.alreadyConverted).toBe(0);
    expect(s.totalOracles).toBe(29);
    expect(s.totalCredits).toBe(29 * 300);
    expect(s.wouldConvert).toEqual([
      { id: ids.a, email: "convert-a@example.com", oracles: 7, credits: 2100 },
      { id: ids.c, email: "convert-c@example.com", oracles: 5, credits: 1500 },
      { id: ids.d, email: "convert-d@example.com", oracles: 12, credits: 3600 },
      { id: ids.b, email: "convert-b@example.com", oracles: 5, credits: 1500 },
    ]);
    expect(r.stderr).toMatch(/DRY RUN .*Nothing was changed/);
    expect(await conversionGrants()).toEqual([]);
    expect(await conversionTxs()).toEqual([]);
    expect(await balances(ids.a)).toEqual({ monthly: 0, purchased: 7, total: 7 });
    expect(await balances(ids.d)).toEqual({ monthly: 0, purchased: 12, total: 12 });
  });

  it("--live converts holders x300, refuses monthly-grant and post-flag-purchase users, and lists them", async () => {
    const r = runLive();
    expect(r.status, r.stderr).toBe(0);
    const s = r.json!;
    expect(s.mode).toBe("live");
    expect(s.holders).toBe(4);
    expect(s.usersConverted).toBe(2);
    expect(s.alreadyConverted).toBe(0);
    expect(s.refusedCount).toBe(2);
    expect(s.errorCount).toBe(0);
    expect(s.totalOracles).toBe(7 + 12);
    expect(s.totalCredits).toBe((7 + 12) * 300);
    const converted = s.converted as Array<{ id: string; email: string; oracles: number; credits: number }>;
    expect(converted.map(({ id, email, oracles, credits }) => ({ id, email, oracles, credits }))).toEqual([
      { id: ids.a, email: "convert-a@example.com", oracles: 7, credits: 2100 },
      { id: ids.d, email: "convert-d@example.com", oracles: 12, credits: 3600 },
    ]);
    const refused = s.refused as Array<{ id: string; email: string; oracles: number; refuseReason: string }>;
    expect(refused).toHaveLength(2);
    const byId = new Map(refused.map((x) => [x.id, x]));
    expect(byId.get(ids.c)).toMatchObject({ email: "convert-c@example.com", oracles: 5 });
    expect(byId.get(ids.c)!.refuseReason).toMatch(/purchase after the flag flip/);
    expect(byId.get(ids.b)).toMatchObject({ email: "convert-b@example.com", oracles: 5 });
    expect(byId.get(ids.b)!.refuseReason).toMatch(/monthly/);
    expect(r.stderr).toMatch(/REFUSED/);

    // A: exactly balance x 300 purchased, monthly unchanged, one grant row, one history row.
    expect(await balances(ids.a)).toEqual({ monthly: 0, purchased: 2100, total: 2100 });
    expect(await conversionGrants(ids.a)).toEqual([{ user_id: ids.a, amount: 2100 }]);
    const txA = await conversionTxs(ids.a);
    expect(txA).toHaveLength(1);
    expect(txA[0].readings).toBe(2100);
    expect(Number(txA[0].amount)).toBe(0);
    // D: pre-flag purchase only -> converts normally.
    expect(await balances(ids.d)).toEqual({ monthly: 0, purchased: 3600, total: 3600 });
    expect(await conversionGrants(ids.d)).toEqual([{ user_id: ids.d, amount: 3600 }]);
    expect(await conversionTxs(ids.d)).toHaveLength(1);
    // B: monthly grant -> refused, keeps unconverted Oracles.
    expect(await balances(ids.b)).toEqual({ monthly: 1000, purchased: 5, total: 1005 });
    expect(await conversionGrants(ids.b)).toEqual([]);
    // C: post-flag purchase -> refused, balance unchanged.
    expect(await balances(ids.c)).toEqual({ monthly: 0, purchased: 5, total: 5 });
    expect(await conversionGrants(ids.c)).toEqual([]);
    // Z: zero balance is outside the population: untouched, no grant.
    expect(await balances(ids.z)).toEqual({ monthly: 0, purchased: 0, total: 0 });
    expect(await conversionGrants(ids.z)).toEqual([]);
  });

  it("a second --live run converts nothing; refused users stay refused and unconverted", async () => {
    const r = runLive();
    expect(r.status, r.stderr).toBe(0);
    const s = r.json!;
    expect(s.usersConverted).toBe(0);
    expect(s.alreadyConverted).toBe(2);
    expect(s.refusedCount).toBe(2);
    expect(s.errorCount).toBe(0);
    expect(s.totalOracles).toBe(0);
    expect(s.totalCredits).toBe(0);
    expect(await balances(ids.a)).toEqual({ monthly: 0, purchased: 2100, total: 2100 });
    expect(await balances(ids.d)).toEqual({ monthly: 0, purchased: 3600, total: 3600 });
    expect(await balances(ids.b)).toEqual({ monthly: 1000, purchased: 5, total: 1005 });
    expect(await balances(ids.c)).toEqual({ monthly: 0, purchased: 5, total: 5 });
    expect(await conversionGrants()).toHaveLength(2);
    expect(await conversionTxs()).toHaveLength(2);
    // The dry run now reports the converted users as already converted.
    const dry = run(RUNNER, ["--dry-run", "--flag-flipped-at", FLIP]);
    expect(dry.json!.alreadyConverted).toBe(2);
    expect(dry.json!.wouldConvertCount).toBe(2);
    // And the census warns that converted holders are not Oracles, and
    // keeps their balances (credits) out of the Oracle totals.
    const census = run(CENSUS, []);
    expect(census.status).toBe(1);
    const c = census.json!;
    expect(c.holders).toBe(4);
    expect(c.unconvertedHolders).toBe(2);
    expect(c.totalOracles).toBe(5 + 5); // B and C only
    expect(c.totalCreditsAfterConversion).toBe(3000);
    expect(c.alreadyConverted).toBe(2);
    expect(c.alreadyConvertedCredits).toBe(2100 + 3600);
    const flags = new Map((c.users as Array<{ id: string; converted: boolean }>).map((u) => [u.id, u.converted]));
    expect(flags.get(ids.a)).toBe(true);
    expect(flags.get(ids.d)).toBe(true);
    expect(flags.get(ids.b)).toBe(false);
    expect(flags.get(ids.c)).toBe(false);
    expect((c.warnings as string[]).join(" ")).toMatch(/2 holder\(s\) already have a 'conversion' grant/);
    expect(census.stderr).toMatch(/WARNING/);
  });

  it("post-conversion top-up purchase grants exactly its credits and a refund revokes exactly that", async () => {
    // Same call shape as the webhook for a top-up (route.ts: grantUnit
    // "credits" for top-ups regardless of the flag).
    const before = await balances(ids.a);
    expect(before).toEqual({ monthly: 0, purchased: 2100, total: 2100 });
    const bought = await db.fulfillOrder({
      userId: ids.a,
      email: "convert-a@example.com",
      packType: "topup-1000 (lemonsqueezy:order-convert-topup-a)",
      amount: 9.99,
      readings: 1000,
      orderId: "order-convert-topup-a",
      grantUnit: "credits",
    });
    expect(bought.duplicate).toBe(false);
    expect(await balances(ids.a)).toEqual({ monthly: 0, purchased: 3100, total: 3100 });
    // Full refund (refunded_amount = the whole 999 cents).
    const refunded = await db.revokeOrder("order-convert-topup-a", "convert-a@example.com", 999);
    expect(refunded).toEqual({ revoked: true, readings: 1000 });
    // Nets to zero against the post-conversion balance.
    expect(await balances(ids.a)).toEqual(before);
    // Redelivered refund revokes nothing more.
    expect((await db.revokeOrder("order-convert-topup-a", "convert-a@example.com", 999)).revoked).toBe(false);
    expect(await balances(ids.a)).toEqual(before);
    // The runner still treats A as converted (the top-up is not re-multiplied).
    const again = runLive();
    expect(again.status, again.stderr).toBe(0);
    expect(again.json!.usersConverted).toBe(0);
    expect(await balances(ids.a)).toEqual(before);
  });
});

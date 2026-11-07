// db-query-timeout.test.ts
//
// Diagnosis 2026-11-07 (hangs): the 10 s server-side statement_timeout
// from commit c7f2ba4 never reaches the server through a
// transaction-mode pooler — PgBouncer/Supavisor discard client
// startup parameters they do not track, and statement_timeout is not
// one Postgres reports, so it cannot be tracked. Proven live on a
// local PgBouncer 1.22 transaction-mode pooler with the app's exact
// connection factory: SHOW statement_timeout returned 0 (direct
// Postgres: 10s) and pg_sleep(15) ran the full 15 s with no 57014.
// A second, independent unbounded wait: a query waiting to acquire
// the max:1 pool connection waits as long as the holder holds it
// (measured: SELECT 1 waited the full 20.0 s for a held connection).
// So a stuck holder plus a discarded statement_timeout turns any
// stall into a 300 s Vercel timeout. The fix has two halves:
// server-side ALTER DATABASE ... SET statement_timeout (runbook in
// docs/STAGING.md; staging needs the DB password, production needs
// Velu's approval) and this client-side deadline, which bounds every
// DB wait the server cannot see: pool acquisition and pooler queue.
// 12 s sits just above the 10 s server timeout so the server kills
// first when its setting is in place; the client race is the
// backstop for waits that never reach a statement.
//
// Run with the three local Postgres URLs, as the other DB suites:
//   SORTES_TEST_DATABASE_URL=postgres://sortes_test:sortes_test_local@localhost:5432/sortes_pgtest_money
//   SORTES_TEST_DATABASE_URL_MIGRATIONS=.../sortes_pgtest_migrations
//   SORTES_TEST_DATABASE_URL_RLS=.../sortes_pgtest_rls
// Without SORTES_TEST_DATABASE_URL the file defines no tests.
import { describe, it, expect, afterEach } from "vitest";
import {
  createAppPostgres,
  APP_STATEMENT_TIMEOUT_MS,
  DB_QUERY_TIMEOUT_MS,
  withDbTimeout,
} from "../db";

const MONEY_URL = process.env.SORTES_TEST_DATABASE_URL ?? "";

const describeIfPg = MONEY_URL ? describe : describe.skip;

describeIfPg("client-side DB query deadline (hang diagnosis 2026-11-07)", () => {
  const pools: Array<{ end: () => Promise<void> }> = [];
  afterEach(async () => {
    for (const p of pools.splice(0)) await p.end();
  });

  it("DB_QUERY_TIMEOUT_MS sits just above the server statement_timeout", () => {
    expect(APP_STATEMENT_TIMEOUT_MS).toBe(10_000);
    expect(DB_QUERY_TIMEOUT_MS).toBe(12_000);
    expect(DB_QUERY_TIMEOUT_MS).toBeGreaterThan(APP_STATEMENT_TIMEOUT_MS);
  });

  it("a fast query through withDbTimeout resolves normally", async () => {
    const sql = createAppPostgres(MONEY_URL);
    pools.push(sql);
    const rows = await withDbTimeout(sql`SELECT 1 AS one`);
    expect(rows).toEqual([{ one: 1 }]);
  });

  it("a query waiting on the held max:1 connection fails at ~12 s, not 300 s", async () => {
    const sql = createAppPostgres(MONEY_URL);
    pools.push(sql);
    // Hold the pool's only connection with an idle open transaction.
    let releaseTx!: () => void;
    const holder = sql
      .begin(async () => {
        await new Promise<void>((resolve) => {
          releaseTx = resolve;
        });
      })
      .catch(() => undefined);
    // Give the holder a moment to take the connection.
    await new Promise((r) => setTimeout(r, 500));
    const start = Date.now();
    const attempt = withDbTimeout(sql`SELECT 1 AS one`);
    await expect(attempt).rejects.toThrow(/timed out/i);
    const waitedMs = Date.now() - start;
    // The deadline is 12 s; allow 1 s of scheduling slack either way.
    expect(waitedMs).toBeGreaterThanOrEqual(11_000);
    expect(waitedMs).toBeLessThan(14_000);
    // Release the holder; the pool must serve the next query normally.
    releaseTx();
    await holder;
    const rows = await withDbTimeout(sql`SELECT 1 AS one`);
    expect(rows).toEqual([{ one: 1 }]);
  }, 30_000);
});

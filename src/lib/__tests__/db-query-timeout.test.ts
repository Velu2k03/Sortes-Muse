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
// Pool-unwedging 2026-11-07: the deadline used to be a BARE race —
// it rejected the caller's promise while the underlying query kept
// holding the single max:1 connection, so a never-settling holder
// wedged the whole Vercel instance (the 6 consecutive /api/auth/me
// failures in 7 minutes were one wedged instance, not six slow
// queries; zero 57014s prove the waits are pre-statement). The old
// test below ("a query waiting on the held max:1 connection fails
// at ~12 s") released the holder manually, so it proved recovery
// only when the holder completes on its own. withDbTimeout now
// CANCELS the query on timeout (AbortController + Query.signal ->
// pool.cancel): a queued job is removed from waiting and rejected,
// an in-flight statement is cancelled server-side, and a timed-out
// transaction rolls back and releases its lease. The two pooler
// tests below prove exactly that, with NO manual release of the
// thing under test, on a local PgBouncer 1.22 transaction-mode rig
// (the same rig that proved the statement_timeout discard).
//
// The rig (recreate after a VM replacement — /tmp is wiped):
//   sudo apt-get install -y pgbouncer   # 1.22.0
//   mkdir -p /tmp/pgbouncer-test
//   pgbouncer.ini: listen 127.0.0.1:6432, pool_mode=transaction,
//     auth_type=trust, auth_file=userlist.txt with
//     "sortes_test" "sortes_test_local", ignore_startup_parameters
//     = statement_timeout (reproduces the Supavisor discard;
//     without it PgBouncer FATALs the connection with 08P01),
//     client_tls_sslmode=require with a self-signed cert/key
//     (the app factory uses ssl:"require"), databases
//     sortes_pgtest_* -> 127.0.0.1:5432.
//   Run as the postgres user (PgBouncer refuses root):
//     su postgres -c "/usr/sbin/pgbouncer /tmp/pgbouncer-test/pgbouncer.ini -d"
//   Verify: PGPASSWORD=sortes_test_local psql -h 127.0.0.1 -p 6432
//     -U sortes_test -d sortes_pgtest_money -c "SHOW statement_timeout"
//     must return 0.
// Override the rig URL with SORTES_TEST_POOLER_URL. The pooler
// tests skip (with a console note) when the rig is not reachable.
//
// Run with the three local Postgres URLs, as the other DB suites:
//   SORTES_TEST_DATABASE_URL=postgres://sortes_test:sortes_test_local@localhost:5432/sortes_pgtest_money
//   SORTES_TEST_DATABASE_URL_MIGRATIONS=.../sortes_pgtest_migrations
//   SORTES_TEST_DATABASE_URL_RLS=.../sortes_pgtest_rls
// Without SORTES_TEST_DATABASE_URL the file defines no tests.
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import {
  createAppPostgres,
  APP_STATEMENT_TIMEOUT_MS,
  DB_QUERY_TIMEOUT_MS,
  withDbTimeout,
  txWithSignal,
} from "../db";
import { withTimeout } from "../fetch-timeout";

const MONEY_URL = process.env.SORTES_TEST_DATABASE_URL ?? "";
// Local PgBouncer 1.22 transaction-mode rig (see header). The app
// factory's statement_timeout startup parameter is discarded by
// it, so only the client-side cancellation can stop a stuck query.
const POOLER_URL =
  process.env.SORTES_TEST_POOLER_URL ??
  "postgres://sortes_test:sortes_test_local@127.0.0.1:6432/sortes_pgtest_money";

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

describeIfPg("pool-unwedging on the PgBouncer rig (2026-11-07)", () => {
  const pools: Array<{ end: () => Promise<void> }> = [];
  let poolerUp = false;

  beforeAll(async () => {
    // Reachability probe (5 s cap) + probe-table setup. When the
    // rig is not running the tests below skip instead of failing.
    const probe = createAppPostgres(POOLER_URL);
    pools.push(probe);
    try {
      await withTimeout(probe`SELECT 1 AS one`, 5_000);
      poolerUp = true;
      await withTimeout(
        probe`CREATE TABLE IF NOT EXISTS pool_probe (n int)`,
        5_000
      );
      await withTimeout(probe`DELETE FROM pool_probe`, 5_000);
    } catch {
      poolerUp = false;
      console.log(
        "pooler rig not reachable at " +
          POOLER_URL.replace(/:[^:@]+@/, ":***@") +
          " — pool-unwedging tests skipped (see the file header for the rig setup)"
      );
    }
  });

  afterAll(async () => {
    if (!poolerUp) return;
    const probe = createAppPostgres(POOLER_URL);
    try {
      await withTimeout(probe`DROP TABLE IF EXISTS pool_probe`, 5_000);
    } catch {
      // Best effort: a leftover scratch table in a test DB is harmless.
    } finally {
      await probe.end().catch(() => undefined);
    }
  });

  afterEach(async () => {
    for (const p of pools.splice(0)) await p.end();
  });

  it("a timed-out transaction releases the max:1 lease with no manual release", async () => {
    if (!poolerUp) {
      console.log("skipped: pooler rig not reachable");
      return;
    }
    const sql = createAppPostgres(POOLER_URL);
    pools.push(sql);
    await withDbTimeout(sql`DELETE FROM pool_probe`);
    // Through the pooler the server statement_timeout is discarded,
    // so this 30 s statement can only be stopped by the client-side
    // cancel. The transaction also writes a row first: if the
    // cancel did not roll the transaction back, the row survives.
    const controller = new AbortController();
    const begin = sql.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      await tx`INSERT INTO pool_probe (n) VALUES (1)`;
      await tx`SELECT pg_sleep(30) AS slept`;
    });
    const start = Date.now();
    await expect(withDbTimeout(begin, controller)).rejects.toThrow(
      /timed out/i
    );
    const waitedMs = Date.now() - start;
    // The deadline is 12 s; allow 1 s of scheduling slack either way.
    expect(waitedMs).toBeGreaterThanOrEqual(11_000);
    expect(waitedMs).toBeLessThan(14_000);
    // NO manual release anywhere: the pool must serve the next query
    // immediately — the cancelled statement rolled the transaction
    // back and freed the lease. If the lease were still held, this
    // would wait out the 12 s deadline and reject instead.
    const t1 = Date.now();
    const rows = await withDbTimeout(sql`SELECT 1 AS one`);
    expect(rows).toEqual([{ one: 1 }]);
    expect(Date.now() - t1).toBeLessThan(5_000);
    // And the rollback really happened: the pre-sleep INSERT is gone.
    const probe = await withDbTimeout(
      sql`SELECT count(*)::int AS n FROM pool_probe`
    );
    expect((probe[0] as { n: number }).n).toBe(0);
  }, 30_000);

  it("a queued query is removed from waiting after its deadline (no ghost job)", async () => {
    if (!poolerUp) {
      console.log("skipped: pooler rig not reachable");
      return;
    }
    const sql = createAppPostgres(POOLER_URL);
    pools.push(sql);
    await withDbTimeout(sql`DELETE FROM pool_probe`);
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
    // Queue an INSERT behind the holder; it must time out at ~12 s
    // and be removed from the pool's waiting list (pool.cancel and
    // the 12 s queue_timeout both remove it). The holder is released
    // AFTER the timeout on purpose: if the queued INSERT were still
    // waiting as a ghost job, it would execute now and the row
    // would appear.
    const start = Date.now();
    const queued = withDbTimeout(sql`INSERT INTO pool_probe (n) VALUES (1)`);
    await expect(queued).rejects.toThrow(/timed out/i);
    const waitedMs = Date.now() - start;
    expect(waitedMs).toBeGreaterThanOrEqual(11_000);
    expect(waitedMs).toBeLessThan(14_000);
    releaseTx();
    await holder;
    // Give a ghost job a moment to run, if one were left behind.
    await new Promise((r) => setTimeout(r, 500));
    const rows = await withDbTimeout(
      sql`SELECT count(*)::int AS n FROM pool_probe`
    );
    expect((rows[0] as { n: number }).n).toBe(0);
    // And the pool serves normally.
    const one = await withDbTimeout(sql`SELECT 1 AS one`);
    expect(one).toEqual([{ one: 1 }]);
  }, 30_000);
});

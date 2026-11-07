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
//   A SECOND instance, pgbouncer-plain.ini, listens on
//   127.0.0.1:6434 with client_tls_sslmode=disable (same databases,
//   same ignore_startup_parameters, own pidfile). The
//   cancel-timeout tests below put a truncating TCP proxy between
//   the client and that instance: a byte-level proxy cannot see
//   inside the TLS of the 6432 rig, and the mechanism under test
//   (Postgres deferring a cancel mid-message + postgres.js
//   cancel_timeout) does not depend on TLS.
//   Run as the postgres user (PgBouncer refuses root):
//     su postgres -c "/usr/sbin/pgbouncer /tmp/pgbouncer-test/pgbouncer.ini -d"
//     su postgres -c "/usr/sbin/pgbouncer /tmp/pgbouncer-test/pgbouncer-plain.ini -d"
//   Verify: PGPASSWORD=sortes_test_local psql -h 127.0.0.1 -p 6432
//     -U sortes_test -d sortes_pgtest_money -c "SHOW statement_timeout"
//     must return 0.
// Override the rig URLs with SORTES_TEST_POOLER_URL (6432, TLS)
// and SORTES_TEST_POOLER_PLAIN_URL (6434, plaintext). The pooler
// tests skip (with a console note) when the rig is not reachable.
//
// Cancel-timeout round 2 (postgres.js 4.1.0, 2026-11-07): the
// production hang was ONE server session stuck mid-protocol-message
// (state active, wait_event ClientRead, inside a transaction, on
// the migration-ledger existence check). Postgres defers query-cancel
// interrupts while reading a protocol message, so statement_timeout,
// idle_in_transaction_session_timeout, and pool.cancel all fail to
// free it. 4.1.0 adds cancel_timeout: when a cancel goes unanswered
// the connection is closed after that many seconds and the pool
// reconnects. The tests below reproduce the stuck state with a
// truncating proxy: it forwards the first Parse message's header +
// 2 body bytes and then holds the rest of that connection forever,
// so the backend waits in ClientRead for the remainder of the
// message. A plain SELECT proves the mechanism (the rejection
// carries CANCEL_UNANSWERED); a pg_sleep inside a transaction
// reproduces the exact production state (a session idle in
// transaction, in ClientRead, with an open xact) and proves the
// pool still recovers from it. Two hard-won details: the app's
// template-tag queries use the EXTENDED protocol (Parse/Bind/...),
// not simple 'Q' — truncating 'Q' truncates nothing; and BEGIN is
// sent as a simple query, not a Parse, so inside a transaction the
// first Parse IS the first in-transaction query.
//
// Run with the three local Postgres URLs, as the other DB suites:
//   SORTES_TEST_DATABASE_URL=postgres://sortes_test:sortes_test_local@localhost:5432/sortes_pgtest_money
//   SORTES_TEST_DATABASE_URL_MIGRATIONS=.../sortes_pgtest_migrations
//   SORTES_TEST_DATABASE_URL_RLS=.../sortes_pgtest_rls
// Without SORTES_TEST_DATABASE_URL the file defines no tests.
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
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

  it("the app pool carries cancel_timeout 5 (postgres.js 4.1.0)", () => {
    const sql = createAppPostgres(MONEY_URL);
    pools.push(sql);
    // 4.1.0 added cancel_timeout (default 5 s); 4.0.0 has no such
    // option at all, so this fails on the old version. The factory
    // sets it explicitly so the value survives a future default
    // change; the behaviour it buys is proven by the cancel-timeout
    // tests below.
    expect(
      (sql as unknown as { options: { cancel_timeout?: number } }).options
        .cancel_timeout
    ).toBe(5);
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "node_modules", "postgres", "package.json"),
        "utf8"
      )
    ) as { version: string };
    expect(pkg.version).toBe("4.1.0");
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

// ---------------------------------------------------------------------------
// Cancel-timeout (postgres.js 4.1.0, round 2). See the file header.
// ---------------------------------------------------------------------------

interface TruncatingProxy {
  port: number;
  truncated: () => boolean;
  close: () => Promise<void>;
}

/** Flatten a postgres.js error + its cause chain into one string. */
function errorChain(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  while (cur instanceof Error) {
    const withCode = cur as Error & { code?: unknown; cause?: unknown };
    parts.push(
      withCode.code !== undefined
        ? `[${String(withCode.code)}] ${cur.message}`
        : cur.message
    );
    cur = withCode.cause;
  }
  return parts.join(" <- cause: ");
}

/**
 * A truncating TCP proxy. It sits between a postgres.js client and a
 * Postgres/pooler target and, once, forwards only the header + 2
 * body bytes of one Parse message and then holds the rest of that
 * connection forever. The backend therefore waits in ClientRead for
 * the remainder of the message — the exact production stuck state —
 * and any cancel sent for the query goes unanswered, so postgres.js
 * 4.1.0 must close the connection after cancel_timeout and the pool
 * must reconnect. CancelRequest connections (16 bytes, code
 * 80877102) are forwarded whole; the StartupMessage is forwarded
 * whole; every other message passes through untouched. After the
 * truncation the held connection drops all further bytes, so the
 * pipelined Bind/Describe/Execute/Sync that follow the Parse can
 * never be consumed as Parse body and corrupt the stream.
 */
function startTruncatingProxy(
  targetPort: number,
  truncateParseIndex = 0
): Promise<TruncatingProxy> {
  return new Promise((resolve) => {
    let truncated = false;
    let parseCount = 0;
    const sockets = new Set<net.Socket>();
    const server = net.createServer((client) => {
      const upstream = net.connect(targetPort, "127.0.0.1");
      sockets.add(client);
      sockets.add(upstream);
      upstream.on("data", (chunk: Buffer) => {
        if (!client.destroyed) client.write(chunk);
      });
      upstream.on("close", () => {
        if (!client.destroyed) client.destroy();
      });
      client.on("close", () => {
        if (!upstream.destroyed) upstream.destroy();
      });
      client.on("error", () => upstream.destroy());
      upstream.on("error", () => client.destroy());

      let buf = Buffer.alloc(0);
      let phase: "start" | "messages" | "passthrough" = "start";
      let held = false;
      client.on("data", (chunk: Buffer) => {
        if (held) return; // consume and drop: the backend stays in ClientRead
        buf = Buffer.concat([buf, chunk]);
        if (phase === "passthrough") {
          upstream.write(buf);
          buf = Buffer.alloc(0);
          return;
        }
        if (phase === "start") {
          if (buf.length < 8) return;
          const len = buf.readInt32BE(0);
          const code = buf.readInt32BE(4);
          if (code === 80877102) {
            // CancelRequest: 16 bytes, forward whole, then passthrough.
            phase = "passthrough";
            if (buf.length >= 16) {
              upstream.write(buf.subarray(0, 16));
              buf = buf.subarray(16);
            }
            if (buf.length) {
              upstream.write(buf);
              buf = Buffer.alloc(0);
            }
            return;
          }
          if (buf.length < len) return; // wait for the full StartupMessage
          upstream.write(buf.subarray(0, len));
          buf = buf.subarray(len);
          phase = "messages";
        }
        while (buf.length >= 5) {
          const type = buf[0];
          const len = buf.readInt32BE(1);
          const total = 1 + len;
          if (buf.length < total) break;
          const msg = buf.subarray(0, total);
          buf = buf.subarray(total);
          if (
            type === 0x50 /* P = Parse */ &&
            !truncated &&
            parseCount++ === truncateParseIndex
          ) {
            truncated = true;
            held = true;
            upstream.write(msg.subarray(0, 7)); // header + 2 body bytes
            buf = Buffer.alloc(0);
            break; // drop the pipelined Bind/Describe/Execute/Sync too
          }
          upstream.write(msg);
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address ? address.port : 0;
      resolve({
        port,
        truncated: () => truncated,
        close: () =>
          new Promise<void>((r) => {
            for (const s of sockets) s.destroy();
            server.close(() => r());
          }),
      });
    });
  });
}

// Plaintext PgBouncer rig for the proxy tests (see the file header).
// The proxy cannot see inside the TLS of the 6432 rig.
const POOLER_PLAIN_URL =
  process.env.SORTES_TEST_POOLER_PLAIN_URL ??
  "postgres://sortes_test:sortes_test_local@127.0.0.1:6434/sortes_pgtest_money";

function plainClient(port: number): postgres.Sql {
  return postgres({
    host: "127.0.0.1",
    port,
    database: "sortes_pgtest_money",
    username: "sortes_test",
    password: "sortes_test_local",
    ssl: false,
    max: 1,
    prepare: false, // extended protocol, like the app factory
    cancel_timeout: 5, // the value under test (same as createAppPostgres)
  });
}

describeIfPg("cancel_timeout closes the connection on an unanswered cancel (postgres.js 4.1.0)", () => {
  let poolerPlainUp = false;

  beforeAll(async () => {
    const probe = postgres(POOLER_PLAIN_URL, { ssl: false, max: 1 });
    try {
      await withTimeout(probe`SELECT 1 AS one`, 5_000);
      poolerPlainUp = true;
    } catch {
      poolerPlainUp = false;
      console.log(
        "plaintext pooler rig not reachable at " +
          POOLER_PLAIN_URL.replace(/:[^:@]+@/, ":***@") +
          " — cancel-timeout pooler test skipped (see the file header for the rig setup)"
      );
    } finally {
      await probe.end().catch(() => undefined);
    }
  });

  it("a plain query whose cancel goes unanswered rejects with CANCEL_UNANSWERED and the pool recovers (pooler)", async () => {
    if (!poolerPlainUp) {
      console.log("skipped: plaintext pooler rig not reachable");
      return;
    }
    const proxy = await startTruncatingProxy(6434, 0);
    const sql = plainClient(proxy.port);
    try {
      const controller = new AbortController();
      const q = sql`SELECT 1 AS one`;
      const t0 = Date.now();
      const attempt = withDbTimeout(
        q as unknown as Promise<unknown>,
        controller
      ).then(
        () => ({ ok: true as const, ms: Date.now() - t0 }),
        (e: unknown) => ({
          ok: false as const,
          err: errorChain(e),
          ms: Date.now() - t0,
        })
      );
      setTimeout(() => controller.abort(), 500);
      const res = await attempt;
      expect(proxy.truncated()).toBe(true);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        // The cancel went unanswered, so 4.1.0 closed the connection
        // after cancel_timeout (5 s) and named the cause.
        expect(res.err).toMatch(/CANCEL_UNANSWERED/);
        // Abort at 500 ms + cancel_timeout 5 s: ~5.5 s, not 12 s
        // (withDbTimeout) and never (4.0.0, which waits forever).
        expect(res.ms).toBeGreaterThanOrEqual(5_000);
        expect(res.ms).toBeLessThan(7_000);
      }
      // The pool reconnected and serves the next query promptly.
      const t1 = Date.now();
      const rows = await sql`SELECT 1 AS one`;
      expect(rows).toEqual([{ one: 1 }]);
      expect(Date.now() - t1).toBeLessThan(5_000);
    } finally {
      await sql.end().catch(() => undefined);
      await proxy.close();
    }
  }, 30_000);

  it("a backend stuck mid-message inside a transaction is freed by cancel_timeout (direct)", async () => {
    // Direct connection for the pg_stat_activity snapshot. The
    // stuck session is identified by pid: snapshot the matching
    // pids first, so leftovers from earlier runs cannot false-pass.
    const direct = createAppPostgres(MONEY_URL);
    const before = (await withDbTimeout(direct`
      SELECT pid FROM pg_stat_activity
      WHERE datname = 'sortes_pgtest_money'
        AND wait_event = 'ClientRead'
        AND state = 'idle in transaction'
        AND xact_start IS NOT NULL`)) as Array<{ pid: number }>;
    const beforePids = new Set(before.map((r) => r.pid));
    // Direct target (no pooler): the truncated Parse reaches a real
    // backend, which waits in ClientRead. Through PgBouncer the
    // partial message is buffered by the pooler instead, so the
    // backend-level state is only observable here.
    const proxy = await startTruncatingProxy(5432, 0);
    const sql = plainClient(proxy.port);
    try {
      const controller = new AbortController();
      // BEGIN is sent as a simple query, not a Parse, so the first
      // Parse IS the in-transaction pg_sleep — the backend is inside
      // its transaction when the message stalls, exactly like the
      // production session (migration-ledger check inside
      // runMigrations' pg.begin).
      const begin = sql.begin(async (rawTx) => {
        const tx = txWithSignal(rawTx, controller.signal);
        await tx`SELECT pg_sleep(30) AS slept`;
      });
      const t0 = Date.now();
      const attempt = withDbTimeout(begin, controller).then(
        () => ({ ok: true as const, ms: Date.now() - t0 }),
        (e: unknown) => ({
          ok: false as const,
          err: errorChain(e),
          ms: Date.now() - t0,
        })
      );
      setTimeout(() => controller.abort(), 500);
      // Mid-flight: a NEW session must be stuck in ClientRead inside
      // its transaction. (Production showed state 'active' for the
      // same wait; here the backend reports 'idle in transaction'
      // because no statement is executing — the wait is identical.)
      await new Promise((r) => setTimeout(r, 2_000));
      const during = (await withDbTimeout(direct`
        SELECT pid, state, wait_event, xact_start IS NOT NULL AS in_xact
        FROM pg_stat_activity
        WHERE datname = 'sortes_pgtest_money'
          AND wait_event = 'ClientRead'
          AND state = 'idle in transaction'
          AND xact_start IS NOT NULL`)) as Array<{
        pid: number;
        state: string;
        wait_event: string;
        in_xact: boolean;
      }>;
      const stuck = during.filter((r) => !beforePids.has(r.pid));
      expect(stuck).toHaveLength(1);
      expect(stuck[0].in_xact).toBe(true);
      const res = await attempt;
      expect(proxy.truncated()).toBe(true);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        // 4.0.0 could not recover from this at all (the cancel was
        // deferred forever and the lease never freed). 4.1.0 closes
        // the connection after cancel_timeout; the transaction path
        // surfaces the close as CONNECTION_CLOSED (the plain-query
        // path surfaces CONNECTION_DESTROYED with a CANCEL_UNANSWERED
        // cause — both are the same destroy, seen from different
        // sides of the rollback).
        expect(res.err).toMatch(/CONNECTION_(DESTROYED|CLOSED)/);
        expect(res.ms).toBeGreaterThanOrEqual(5_000);
        expect(res.ms).toBeLessThan(7_000);
      }
      // The pool reconnected and serves the next query promptly.
      const t1 = Date.now();
      const rows = await sql`SELECT 1 AS one`;
      expect(rows).toEqual([{ one: 1 }]);
      expect(Date.now() - t1).toBeLessThan(5_000);
    } finally {
      await sql.end().catch(() => undefined);
      await direct.end().catch(() => undefined);
      await proxy.close();
    }
  }, 30_000);
});

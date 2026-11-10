import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { createAppPostgres, APP_STATEMENT_TIMEOUT_MS } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { pgTestUrl } from "./pg-test-url";

/**
 * Bug 3 (2026-11-07): database hangs ate the full 300 s function
 * timeout. The app pool (src/lib/db.ts) had max:1, connect_timeout
 * 10 s, idle_timeout 20 s, and NO per-query timeout anywhere, so a
 * hung query held the only connection until Vercel killed the
 * function. The fix is a server-side statement_timeout on the app
 * connection (postgres.js `connection` startup parameter — see
 * node_modules/postgres/README.md "All Postgres options" and
 * types/index.d.ts ConnectionParameters.statement_timeout; the
 * driver sends it in the Startup message, src/startup.js), which
 * cancels the query in Postgres, frees its locks, and returns
 * error 57014 to the client, freeing the single connection.
 *
 * Runs ONLY when the local test URLs are set, against dedicated
 * local databases (never production).
 *
 *   SORTES_TEST_DATABASE_URL=postgres://sortes_test:<local-password>@127.0.0.1:5432/sortes_pgtest_money
 *   SORTES_TEST_DATABASE_URL_MIGRATIONS=postgres://sortes_test:<local-password>@127.0.0.1:5432/sortes_pgtest_migrations
 *
 * (Local-only staging password: keep the real value out of the repo;
 * set it in your shell when running the suite.)
 */
const MONEY_URL = pgTestUrl("SORTES_TEST_DATABASE_URL");
const MIGRATIONS_URL = pgTestUrl("SORTES_TEST_DATABASE_URL_MIGRATIONS");

describe.skipIf(!MONEY_URL)("statement_timeout on real Postgres (staging only)", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = createAppPostgres(MONEY_URL);
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("the app timeout value is 10 s", () => {
    // Normal app queries run in milliseconds; 10 s is generous for
    // the app-query path while failing fast on hangs.
    expect(APP_STATEMENT_TIMEOUT_MS).toBe(10_000);
  });

  it("the session really carries the timeout (startup parameter landed)", async () => {
    const rows = (await sql`SHOW statement_timeout`) as Array<{ statement_timeout: string }>;
    expect(rows[0].statement_timeout).toBe("10s");
  });

  it("a hung query fails fast with a statement timeout instead of hanging", async () => {
    // pg_sleep(15) runs past the 10 s timeout: without the fix this
    // resolves after ~15 s; with the fix Postgres cancels it at
    // ~10 s with 57014. The 300 s function timeout is never reached.
    const start = Date.now();
    await expect(sql.unsafe("SELECT pg_sleep(15)")).rejects.toThrow(/statement timeout/i);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(8_000);
    expect(elapsed).toBeLessThan(20_000);
  }, 30_000);

  it("the single connection is reusable afterwards (critical for max:1)", async () => {
    // A client-side race alone would leave the timed-out query
    // holding the only connection; the server-side cancel must free
    // it, so the very next query on the same client works.
    const rows = (await sql`SELECT 1 AS n`) as Array<{ n: number }>;
    expect(rows[0].n).toBe(1);
    const timeout = (await sql`SHOW statement_timeout`) as Array<{ statement_timeout: string }>;
    expect(timeout[0].statement_timeout).toBe("10s");
  });

  it("normal queries still work through the app module", async () => {
    vi.resetModules();
    (process.env as Record<string, string | undefined>).POSTGRES_URL = MONEY_URL;
    delete (process.env as Record<string, string | undefined>).DATABASE_URL;
    const db = (await import("@/lib/db")) as typeof import("@/lib/db");
    await db.ensureSchema();
    const user = await db.createUser("timeout-a@example.com");
    expect((await db.getUserById(user.id))?.email).toBe("timeout-a@example.com");
    expect(await db.getUserByEmail("nobody-timeout@example.com")).toBeNull();
  });
});

describe.skipIf(!MIGRATIONS_URL)("migrations under the app statement timeout (staging only)", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = createAppPostgres(MIGRATIONS_URL);
    await sql.unsafe(
      `DROP TABLE IF EXISTS schema_migrations, users, auth_codes, transactions, readings, reports, free_interpretations, free_readings CASCADE`
    );
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  it("runMigrations applies all files through an app-configured client", async () => {
    const done = await runMigrations(sql);
    expect(done.map((d) => d.version)).toEqual(["001", "002", "003", "006", "007"]);
    const ledger = (await sql`SELECT version FROM schema_migrations ORDER BY version`) as Array<{
      version: string;
    }>;
    expect(ledger.map((r) => r.version)).toEqual(["001", "002", "003", "006", "007"]);
  });

  it("a second run emits no already-exists NOTICE (ledger check precedes CREATE)", async () => {
    // Before the fix, readAppliedVersions ran CREATE TABLE IF NOT
    // EXISTS first, so every cold start emitted the 42P07 NOTICE.
    // Now the existence check runs first and CREATE fires only
    // when the table is missing, so a steady-state run is silent.
    const notices: string[] = [];
    const watched = postgres(MIGRATIONS_URL, {
      prepare: false,
      max: 1,
      connection: { statement_timeout: APP_STATEMENT_TIMEOUT_MS },
      onnotice: (notice) => {
        const msg =
          typeof notice === "string" ? notice : ((notice as { message?: string })?.message ?? "");
        notices.push(msg);
      },
    });
    try {
      await runMigrations(watched);
      expect(notices.filter((m) => /already exists, skipping/i.test(m))).toHaveLength(0);
    } finally {
      await watched.end();
    }
  });

  it("SET LOCAL lifts the timeout inside a migration-style transaction (exemption mechanism)", async () => {
    // This is the exact mechanism runMigrations uses per file:
    // SET LOCAL is scoped to the transaction, so a long DDL
    // statement (CREATE INDEX, the 002 row-by-row repair) is not
    // killed mid-flight, and the lift cannot leak to app queries
    // on the shared max:1 connection. pg_sleep(12) runs past the
    // 10 s session timeout and must still complete.
    const start = Date.now();
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = 0");
      await tx.unsafe("SELECT pg_sleep(12)");
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(11_000);
  }, 30_000);
});

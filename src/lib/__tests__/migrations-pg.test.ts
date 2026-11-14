import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { pgTestUrl } from "./pg-test-url";

/**
 * Phase 6 migration system, executed against a real Postgres.
 * Runs ONLY when SORTES_TEST_DATABASE_URL_MIGRATIONS is set, against
 * that dedicated database (never production).
 *
 * Proves the production-safety claim: the database starts in the
 * exact state production is in (verified live 2026-11-06 — 6 of 7
 * tables, free_readings missing, zero secondary indexes, no ledger),
 * then the migrations apply cleanly, keep existing data, and re-run
 * as a no-op — both through the CLI (npm run db:migrate) and
 * through the in-app runner.
 *
 *   SORTES_TEST_DATABASE_URL_MIGRATIONS=postgres://sortes_test:sortes_test_local@localhost:5432/sortes_pgtest_migrations npm test -- src/lib/__tests__/migrations-pg.test.ts
 */
const TEST_URL = pgTestUrl("SORTES_TEST_DATABASE_URL_MIGRATIONS");
const SKIP = !TEST_URL;

const OLD_SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  winback_sent_at TIMESTAMPTZ,
  password_hash TEXT
);
CREATE TABLE auth_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL,
  pack_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  readings INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE readings (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE free_interpretations (
  user_id TEXT NOT NULL REFERENCES users(id),
  system TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, system)
);
INSERT INTO users (id, email, credits) VALUES ('u_old', 'old@example.com', 7);
INSERT INTO transactions (id, user_id, email, pack_type, amount, readings)
  VALUES ('t_old', 'u_old', 'old@example.com', 'pack5 (lemonsqueezy:order-old)', 3.99, 5);
-- A reading written by the old buggy ${JSON.stringify}::jsonb pattern:
-- stored as a JSON string, not an object. Migration 002 must repair it.
INSERT INTO readings (id, user_id, data)
  VALUES ('r_old', 'u_old', '"{\\"id\\":\\"r_old\\",\\"question\\":\\"old?\\"}"'::jsonb);
-- A double-encoded REPORT too (migration 002's reports repair loop
-- was unproven until Phase 6B): same bug, same fix, other table.
INSERT INTO reports (id, user_id, data)
  VALUES ('rep_old', 'u_old', '"{\\"id\\":\\"rep_old\\",\\"title\\":\\"old report\\"}"'::jsonb);
-- A reading whose data is a JSON string that is NOT valid JSON when
-- unwrapped (a double-encoded scalar string): migration 002 must
-- skip it with a warning, not fail the migration.
INSERT INTO readings (id, user_id, data)
  VALUES ('r_unparseable', 'u_old', '"not json at all"'::jsonb);
-- The orphan nonce table a pre-Phase-6 ensureSchema() left behind.
-- Migration 003 must drop it.
CREATE TABLE checkout_nonces (
  nonce TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
`;

describe.skipIf(SKIP)("migrations on real Postgres (staging only)", () => {
  let raw: postgres.Sql;

  beforeAll(async () => {
    raw = postgres(TEST_URL, { prepare: false, max: 1 });
    await raw.unsafe(
      `DROP TABLE IF EXISTS schema_migrations, users, auth_codes, transactions, readings, reports, free_interpretations, free_readings CASCADE`
    );
    // Production's pre-state, as verified live 2026-11-06.
    await raw.unsafe(OLD_SCHEMA);
  }, 30_000);

  afterAll(async () => {
    await raw?.end();
  });

  function runCli(): string {
    return execFileSync("node", [path.join(process.cwd(), "scripts", "migrate.mjs")], {
      encoding: "utf8",
      env: { ...process.env, POSTGRES_URL: TEST_URL, NODE_ENV: "test" },
    });
  }

  it("CLI applies 001+002+003+006+007+008+009 to the production-like schema, keeps data, re-runs as a no-op", async () => {
    const first = runCli();
    expect(first).toContain("001 baseline — applied");
    expect(first).toContain("002 indexes_constraints — applied");
    expect(first).toContain("003 drop_checkout_nonces — applied");
    expect(first).toContain("006 session_version — applied");
    expect(first).toContain("007 order_id_unique — applied");
    expect(first).toContain("008 credit_ledgers — applied");
    expect(first).toContain("009 subscriptions — applied");
    // Existing data survived the migration.
    const user = (await raw`SELECT credits FROM users WHERE id = 'u_old'`) as Array<{ credits: number }>;
    expect(user[0].credits).toBe(7);
    // Phase 2 batch 2: the old Oracle balance backfilled into
    // PURCHASED (never expires); monthly starts at 0; the total is
    // the generated sum of the two.
    const ledgers = (await raw`SELECT monthly_credits, purchased_credits, credits FROM users WHERE id = 'u_old'`) as Array<{
      monthly_credits: number;
      purchased_credits: number;
      credits: number;
    }>;
    expect(ledgers[0]).toEqual({ monthly_credits: 0, purchased_credits: 7, credits: 7 });
    const grants = (await raw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'credit_grants'`) as unknown as unknown[];
    expect(grants).toHaveLength(1);
    const tx = (await raw`SELECT COUNT(*)::int AS n FROM transactions`) as Array<{ n: number }>;
    expect(tx[0].n).toBe(1);
    // free_readings (missing in production) now exists.
    const tables = (await raw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'free_readings'`) as unknown as unknown[];
    expect(tables).toHaveLength(1);
    // The double-encoded reading was repaired in place by 002.
    const repaired = (await raw`SELECT data FROM readings WHERE id = 'r_old'`) as Array<{ data: unknown }>;
    expect(repaired).toHaveLength(1);
    expect(repaired[0].data).toEqual({ id: "r_old", question: "old?" });
    // The double-encoded REPORT was repaired too (Phase 6B: the
    // reports loop was previously unexercised).
    const repairedReport = (await raw`SELECT data FROM reports WHERE id = 'rep_old'`) as Array<{ data: unknown }>;
    expect(repairedReport).toHaveLength(1);
    expect(repairedReport[0].data).toEqual({ id: "rep_old", title: "old report" });
    // Phase G follow-up: the unparseable double-encoded scalar was
    // skipped with a warning, not repaired and not fatal. The row
    // survives with its data untouched, and the migration still
    // applied (asserted above via the ledger output).
    const skipped = (await raw`SELECT data FROM readings WHERE id = 'r_unparseable'`) as Array<{ data: unknown }>;
    expect(skipped).toHaveLength(1);
    expect(skipped[0].data).toBe("not json at all");
    // The orphan nonce table is gone (003).
    const nonce = (await raw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'checkout_nonces'`) as unknown as unknown[];
    expect(nonce).toHaveLength(0);
    // Second CLI run: nothing new to apply.
    const second = runCli();
    expect(second).toContain("already applied");
    expect(second).toContain("0 new migration(s) applied");
  });

  it("in-app runner sees the same ledger and applies nothing further", async () => {
    vi.resetModules();
    (process.env as Record<string, string | undefined>).POSTGRES_URL = TEST_URL;
    const db = (await import("@/lib/db")) as typeof import("@/lib/db");
    // ensureSchema is the in-app trigger; the ledger already has
    // all eight versions, so this must be a no-op, not an error.
    await expect(db.ensureSchema()).resolves.toBeUndefined();
    const ledger = (await raw`SELECT version FROM schema_migrations ORDER BY version`) as Array<{ version: string }>;
    expect(ledger.map((r) => r.version)).toEqual(["001", "002", "003", "006", "007", "008", "009", "010"]);
    // The app works against the migrated schema.
    const user = await db.getUserByEmail("old@example.com");
    expect(user?.credits).toBe(7);
    expect(await db.hasUsedFreeReading("u_old")).toBe(false);
  });

  it("migration files exempt transaction_timeout (SET LOCAL) alongside the other two timeouts", () => {
    // Pool-unwedging round 2 (2026-11-07): the database-level
    // transaction_timeout kills a transaction unconditionally, even
    // one stuck mid-protocol-message, so a long migration must never
    // be subject to it mid-DDL. The runner lifts all three timeouts
    // inside each file transaction; SET LOCAL scopes the lifts to
    // that transaction only. This is a source-level contract: a
    // behavioural test would need a slow migration file, and none
    // exists (the real files apply in milliseconds on a test DB),
    // so this guards the exemption text instead.
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "migrations.ts"),
      "utf8"
    );
    expect(src).toContain("SET LOCAL statement_timeout = 0");
    expect(src).toContain("SET LOCAL idle_in_transaction_session_timeout = 0");
    // transaction_timeout exists only on PG 17+; the local test DBs
    // run PG 16, where a bare SET LOCAL errors. The lift therefore
    // goes through a DO block that swallows exactly undefined_object
    // (see the comment in migrations.ts) — assert that form, not a
    // bare SET LOCAL.
    expect(src).toContain("set_config('transaction_timeout', '0', true)");
    expect(src).toContain("EXCEPTION WHEN undefined_object");
  });

  it("in-app runner REFUSES to apply a pending migration in production", async () => {
    // Phase 6B: ensureSchema() used to auto-apply pending migrations
    // on first DB use with no approval gate, bypassing the
    // SORTES_MIGRATE_PRODUCTION=1 rule that scripts/migrate.mjs
    // enforces. In production it must now throw and apply nothing.
    await raw`DELETE FROM schema_migrations WHERE version = '002'`;
    vi.resetModules();
    const env = process.env as Record<string, string | undefined>;
    env.POSTGRES_URL = TEST_URL;
    env.NODE_ENV = "production";
    delete env.VERCEL_ENV;
    const db = (await import("@/lib/db")) as typeof import("@/lib/db");
    await expect(db.ensureSchema()).rejects.toThrow(/Pending database migrations.*002/);
    // Nothing was applied: the ledger still lacks 002 (003 and 006 stay).
    const ledger = (await raw`SELECT version FROM schema_migrations ORDER BY version`) as Array<{ version: string }>;
    expect(ledger.map((r) => r.version)).toEqual(["001", "003", "006", "007", "008", "009", "010"]);
    // Restore the ledger via the CLI (NODE_ENV=test) so later tests
    // see the fully migrated schema again.
    env.NODE_ENV = "test";
    const out = runCli();
    expect(out).toContain("002 indexes_constraints — applied");
  });
});

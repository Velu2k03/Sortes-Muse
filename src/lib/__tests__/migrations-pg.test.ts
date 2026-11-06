import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { execFileSync } from "child_process";
import path from "path";

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
const TEST_URL = process.env.SORTES_TEST_DATABASE_URL_MIGRATIONS ?? "";
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

  it("CLI applies 001+002 to the production-like schema, keeps data, re-runs as a no-op", async () => {
    const first = runCli();
    expect(first).toContain("001 baseline — applied");
    expect(first).toContain("002 indexes_constraints — applied");
    // Existing data survived the migration.
    const user = (await raw`SELECT credits FROM users WHERE id = 'u_old'`) as Array<{ credits: number }>;
    expect(user[0].credits).toBe(7);
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
    // both versions, so this must be a no-op, not an error.
    await expect(db.ensureSchema()).resolves.toBeUndefined();
    const ledger = (await raw`SELECT version FROM schema_migrations ORDER BY version`) as Array<{ version: string }>;
    expect(ledger.map((r) => r.version)).toEqual(["001", "002"]);
    // The app works against the migrated schema.
    const user = await db.getUserByEmail("old@example.com");
    expect(user?.credits).toBe(7);
    expect(await db.hasUsedFreeReading("u_old")).toBe(false);
  });
});

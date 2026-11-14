import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import postgres from "postgres";
import { pgTestUrl } from "./pg-test-url";

/**
 * Batch N3 (A4/B6): restore.mjs must verify a pre-008 dump — the
 * exact backup a rollback would restore — instead of failing with
 * "relation credit_grants does not exist" after the data is in.
 *
 * End-to-end against a real local Postgres (same shape as
 * migrations-pg.test.ts): build a pre-008 source DB from migrations
 * 001/002/003/006/007, pg_dump it, restore it with scripts/restore.mjs
 * and assert the verify step passes and omits the missing tables.
 * A second test does the same on a post-009 source and asserts the
 * subscriptions count IS reported.
 *
 * Runs ONLY when SORTES_TEST_DATABASE_URL_MIGRATIONS is set AND the
 * pg_dump/psql binaries exist. Uses its own source/target databases
 * (never the shared money or migrations DBs) so it cannot collide
 * with migrations-pg.test.ts running in a parallel worker.
 */
const TEST_URL = pgTestUrl("SORTES_TEST_DATABASE_URL_MIGRATIONS");

function hasBinary(bin: string): boolean {
  return spawnSync("which", [bin]).status === 0;
}

const SKIP =
  !TEST_URL || !hasBinary("pg_dump") || !hasBinary("psql") || !hasBinary("pg_restore");

const SRC_DB = "sortes_pgtest_restore_src";
const TGT_DB = "sortes_pgtest_restore_tgt";

function urlWithDb(base: string, db: string): string {
  const u = new URL(base);
  u.pathname = `/${db}`;
  return u.toString();
}

function maintUrl(): string {
  return urlWithDb(TEST_URL, "postgres");
}

async function recreateDb(db: string): Promise<void> {
  const sql = postgres(maintUrl(), { max: 1 });
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS "${db}"`);
    await sql.unsafe(`CREATE DATABASE "${db}"`);
  } finally {
    await sql.end();
  }
}

async function dropDb(db: string): Promise<void> {
  const sql = postgres(maintUrl(), { max: 1 });
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS "${db}"`);
  } finally {
    await sql.end();
  }
}

function psqlFile(dbUrl: string, file: string): void {
  execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], {
    stdio: "pipe",
  });
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

function applyMigrations(dbUrl: string, files: string[]): void {
  for (const f of files) psqlFile(dbUrl, path.join(MIGRATIONS_DIR, f));
}

// The fixture applies migration files with raw psql, which does not
// create the schema_migrations ledger the way scripts/migrate.mjs
// does. A real pre-008 production dump HAS the ledger (versions 001
// through 007), and the verify query counts it, so record the same
// rows here to keep the fixture realistic.
async function recordLedger(dbUrl: string, versions: string[]): Promise<void> {
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    );
    for (const v of versions) {
      await sql.unsafe(
        `INSERT INTO schema_migrations (version, name) VALUES ('${v}', '${v}') ON CONFLICT (version) DO NOTHING`,
      );
    }
  } finally {
    await sql.end();
  }
}

async function seedUsers(dbUrl: string, credits: number[]): Promise<void> {
  const sql = postgres(dbUrl, { max: 1 });
  try {
    for (let i = 0; i < credits.length; i++) {
      await sql.unsafe(
        `INSERT INTO users (id, email, credits) VALUES ('u_restore_${i}', 'restore${i}@example.com', ${credits[i]})`,
      );
    }
  } finally {
    await sql.end();
  }
}

let workDir = "";

describe.skipIf(SKIP)("restore.mjs on pre-008 and post-009 dumps", () => {
  beforeAll(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), "sortes-restore-pre008-"));
    await recreateDb(SRC_DB);
    await recreateDb(TGT_DB);
  }, 60_000);

  afterAll(async () => {
    await dropDb(SRC_DB).catch(() => {});
    await dropDb(TGT_DB).catch(() => {});
    if (workDir) rmSync(workDir, { force: true, recursive: true });
  }, 60_000);

  it("restores and verifies a pre-008 dump (no credit_grants, no subscriptions)", async () => {
    const srcUrl = urlWithDb(TEST_URL, SRC_DB);
    applyMigrations(srcUrl, [
      "001_baseline.sql",
      "002_indexes_constraints.sql",
      "003_drop_checkout_nonces.sql",
      "006_session_version.sql",
      "007_order_id_unique.sql",
    ]);
    await recordLedger(srcUrl, ["001", "002", "003", "006", "007"]);
    await seedUsers(srcUrl, [5, 0]);
    const dump = path.join(workDir, "pre008.dump");
    execFileSync(
      "pg_dump",
      [srcUrl, "--format=custom", "--no-owner", "--no-acl", "--file", dump],
      { stdio: "pipe" },
    );
    const res = spawnSync(
      "node",
      [
        "scripts/restore.mjs",
        "--dump",
        dump,
        "--target",
        urlWithDb(TEST_URL, TGT_DB),
        "--create",
      ],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("restore: OK");
    expect(res.stdout).not.toContain("credit_grants");
    expect(res.stdout).not.toContain("subscriptions");
    // The users count line proves the verify query actually ran.
    expect(res.stdout).toMatch(/users\s*\|\s*2/);
  });

  it("restores and verifies a post-009 dump (subscriptions counted)", async () => {
    const srcUrl = urlWithDb(TEST_URL, SRC_DB);
    applyMigrations(srcUrl, [
      "008_credit_ledgers.sql",
      "009_subscriptions.sql",
    ]);
    await recordLedger(srcUrl, ["008", "009"]);
    const sql = postgres(srcUrl, { max: 1 });
    try {
      await sql.unsafe(
        `INSERT INTO subscriptions (id, user_id, lemonsqueezy_subscription_id, tier, billing_interval, status) VALUES ('sub_restore_1', 'u_restore_0', 'ls_restore_1', 'spark', 'monthly', 'active')`,
      );
      await sql.unsafe(
        `INSERT INTO credit_grants (id, user_id, kind, amount) VALUES ('cg_restore_1', 'u_restore_0', 'purchased', 5)`,
      );
    } finally {
      await sql.end();
    }
    const dump = path.join(workDir, "post009.dump");
    execFileSync(
      "pg_dump",
      [srcUrl, "--format=custom", "--no-owner", "--no-acl", "--file", dump],
      { stdio: "pipe" },
    );
    // Fresh target: the pre-008 restore above already filled TGT_DB;
    // --create does not wipe it, so drop + recreate first.
    await recreateDb(TGT_DB);
    const res = spawnSync(
      "node",
      [
        "scripts/restore.mjs",
        "--dump",
        dump,
        "--target",
        urlWithDb(TEST_URL, TGT_DB),
        "--create",
      ],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("restore: OK");
    expect(res.stdout).toMatch(/subscriptions\s*\|\s*1/);
    expect(res.stdout).toMatch(/credit_grants\s*\|\s*1/);
  });
});

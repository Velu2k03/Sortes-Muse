// GENERATED — do not edit by hand.
// Source of truth: migrations/*.sql. Regenerate with:
//   node scripts/sync-migrations.mjs
export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
}

export const MIGRATION_FILES: MigrationFile[] = [
  { version: "001", name: "baseline", sql: `-- 001_baseline.sql — Phase 6 migration system.
-- Baseline schema: exactly the final state the old ensureSchema()
-- (src/lib/db.ts, pre-Phase-6) created with CREATE TABLE IF NOT EXISTS
-- + ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Every statement is
-- idempotent, so applying this to a database that already ran
-- ensureSchema (including production, which has 6 of these 7 tables
-- as of 2026-11-06) is a no-op for the tables that exist and creates
-- only what is missing.
--
-- Tables: users, auth_codes, transactions, readings, reports,
-- free_interpretations, free_readings. The checkout_nonces table from
-- the old schema is intentionally NOT here: the claim endpoint and
-- its nonce machinery were deleted in Phase 6 (B-F), production
-- never had that table, and nothing references it any more.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  winback_sent_at TIMESTAMPTZ,
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS auth_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL,
  pack_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  readings INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS free_interpretations (
  user_id TEXT NOT NULL REFERENCES users(id),
  system TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, system)
);

CREATE TABLE IF NOT EXISTS free_readings (
  user_id TEXT NOT NULL REFERENCES users(id),
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

-- Back-compat: databases created by the old ensureSchema() before the
-- winback/password columns were inlined above get them here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS winback_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
` },
  { version: "002", name: "indexes_constraints", sql: `-- 002_indexes_constraints.sql — Phase 6 (readiness review N11).
-- Production (verified 2026-11-06) has 7 indexes, all PK/unique, and
-- zero secondary indexes, while the journal loads run
-- ORDER BY created_at DESC on readings/reports and the webhook dup
-- check scans transactions by pack_type. These indexes cover exactly
-- those queries. The CHECK makes a negative Oracle balance
-- impossible even for direct SQL; application logic already clamps
-- with GREATEST(0, ...), so existing data satisfies it.

CREATE INDEX IF NOT EXISTS idx_readings_user_created
  ON readings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_user_created
  ON reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_pack_type
  ON transactions (pack_type);

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; the DO block makes
-- re-running this migration a no-op instead of an error.
DO $$
BEGIN
  BEGIN
    ALTER TABLE users
      ADD CONSTRAINT users_credits_nonnegative CHECK (credits >= 0);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;

-- Phase 6 (G2 finding): readings/reports written by the old
-- \${JSON.stringify(x)}::jsonb pattern were stored as JSON strings,
-- not objects (postgres.js double-encodes that pattern — proven by
-- the real-Postgres suite). Re-encode any such rows in place; rows
-- that are already objects are untouched, and a row whose string is
-- not valid JSON is skipped with a warning instead of failing the
-- whole migration.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM readings WHERE jsonb_typeof(data) = 'string' LOOP
    BEGIN
      UPDATE readings SET data = (data #>> '{}')::jsonb WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '002: skipping unparseable reading %', r.id;
    END;
  END LOOP;
  FOR r IN SELECT id FROM reports WHERE jsonb_typeof(data) = 'string' LOOP
    BEGIN
      UPDATE reports SET data = (data #>> '{}')::jsonb WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '002: skipping unparseable report %', r.id;
    END;
  END LOOP;
END
$$;
` },
];

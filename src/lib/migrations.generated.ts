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
  { version: "003", name: "drop_checkout_nonces", sql: `-- 003_drop_checkout_nonces.sql — Phase 6B (readiness review N11).
-- The checkout claim endpoint and its nonce machinery were deleted
-- in Phase 6 (B-F), and the baseline migration 001 deliberately does
-- not create the table. Any database that ran the pre-Phase-6
-- ensureSchema() (local dev / staging) still holds the orphan table;
-- production never had it (verified live 2026-11-06: 6 of 8 tables,
-- checkout_nonces absent). Dropping it keeps the schema exactly what
-- the code expects. Idempotent (IF EXISTS) and safe: nothing in the
-- code references the table any more (verified by repo-wide grep).
-- RLS note: the approval-required RLS file is numbered 004 so it
-- promotes cleanly after this one.

DROP TABLE IF EXISTS checkout_nonces;
` },
  { version: "006", name: "session_version", sql: `-- 006_session_version.sql — Phase B (R5).
-- Session revocation: a per-user session version that is carried in
-- the JWT as the \`pwdVer\` claim (src/lib/auth.ts) and checked on
-- every getSession call. A mismatch means the session is dead.
-- The version is bumped whenever the password is set or changed
-- (src/lib/db.ts setUserPassword), so a stolen token stops working
-- as soon as the owner changes their password. Logout stays
-- cookie-clear only (single-device logout is the current behaviour;
-- "sign out everywhere" would be a new feature — see the decision
-- log, it is recorded as a follow-up, not built here).
--
-- Column name: \`pwd_ver\` (the JWT claim is \`pwdVer\`; one name root,
-- documented in src/lib/auth.ts). DEFAULT 1 matches the claim value
-- assumed for legacy tokens issued before this migration, so
-- sessions issued before the deploy keep working until the first
-- password change bumps the version to 2.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) and purely additive: no
-- rows are modified, only the column (default 1) is added.
-- Applies in version order after 003 via the normal runner
-- (migrations.generated.ts); production application follows the
-- deploy-order hard gate in docs/PRODUCTION-CHANGE-PLAN.md:
-- apply 001-003 AND 006 to production BEFORE merge/deploy.
--
-- Rollback: ALTER TABLE users DROP COLUMN IF EXISTS pwd_ver;
-- (sessions issued after the migration carry a pwdVer claim the old
-- code ignores, so rollback is safe; tokens issued while the column
-- existed keep working because getSession treats a missing column
-- as version 1.)

ALTER TABLE users ADD COLUMN IF NOT EXISTS pwd_ver INTEGER NOT NULL DEFAULT 1;
` },
  { version: "007", name: "order_id_unique", sql: `-- 007_order_id_unique.sql (AF-004)
-- Give fulfilled orders a DB-level UNIQUE order_id, so a redelivered
-- webhook can never double-grant even if the application duplicate
-- check is bypassed or raced.
--
-- If the CREATE UNIQUE INDEX below ever fails on a database that already
-- has duplicate order_ids, that fails loudly BY DESIGN: run
-- scripts/reconcile.mjs and investigate before re-applying.
--
-- All statements are idempotent.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_id TEXT;

-- Backfill fulfilment rows only, from the pack_type marker
-- "lemonsqueezy:<orderId>)". Refund rows (pack_type contains ':refund')
-- are excluded so they never claim the order's unique slot.
UPDATE transactions
   SET order_id = substring(pack_type from 'lemonsqueezy:([^):]+)')
 WHERE order_id IS NULL
   AND pack_type LIKE '%lemonsqueezy:%'
   AND pack_type NOT LIKE '%:refund%';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_order_id_unique
  ON transactions (order_id)
  WHERE order_id IS NOT NULL;
` },
];

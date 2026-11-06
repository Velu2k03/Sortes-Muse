-- 001_baseline.sql — Phase 6 migration system.
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

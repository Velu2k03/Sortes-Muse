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
  { version: "008", name: "credit_ledgers", sql: `-- 008_credit_ledgers.sql — Phase 2 batch 2: two-ledger credit system.
--
-- Design (chosen over a pure per-grant ledger — see src/lib/db/ledgers.ts):
-- the two balances live as columns on users (monthly_credits,
-- purchased_credits) and users.credits becomes a GENERATED total, so
-- every existing read site (balance API, auth/me, account export, UI)
-- keeps working unchanged and every spend stays one atomic UPDATE,
-- the same shape the money-path tests already prove. The credit_grants
-- table is the audit/idempotency ledger: one row per monthly grant
-- (unique per subscription + period, so a retried grant never
-- double-grants) and one row per Oracle conversion (unique per user).
--
-- Backfill: every existing Oracle balance is purchased credit — Oracles
-- never expired, and purchased credits never expire. Monthly starts at 0
-- for everyone: no subscription exists yet, so nobody holds monthly
-- credits. The backfill guard (monthly = 0 AND purchased = 0 AND
-- credits > 0) makes a re-run a no-op for rows that already hold a
-- monthly balance.
--
-- Rollover is enforced at grant time, not by expiring rows: a monthly
-- grant is capped so the monthly balance never exceeds two months of
-- the plan (Spark 2,000; Star 5,000; Moon 12,000). Monthly grant rows
-- record expires_at = period end for audit only; the spend path never
-- reads it, so a monthly balance is never silently deleted.
--
-- All statements are idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_credits INTEGER NOT NULL DEFAULT 0;

-- Backfill BEFORE credits becomes generated (it still holds the old
-- plain Oracle balance here).
UPDATE users
   SET purchased_credits = credits
 WHERE monthly_credits = 0
   AND purchased_credits = 0
   AND credits > 0;

-- The old single balance becomes the generated total of the two
-- ledgers. Dropping the column also drops the 002 CHECK constraint
-- (users_credits_nonnegative), which the two per-ledger CHECKs below
-- replace. Any code that still writes \`SET credits = ...\` fails
-- loudly after this ("cannot update a generated column") instead of
-- silently diverging from the ledgers.
ALTER TABLE users DROP COLUMN IF EXISTS credits;
ALTER TABLE users ADD COLUMN credits INTEGER
  GENERATED ALWAYS AS (monthly_credits + purchased_credits) STORED;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; the DO-block pattern
-- (same as migration 002) makes re-running a no-op instead of an error.
DO $$
BEGIN
  BEGIN
    ALTER TABLE users
      ADD CONSTRAINT users_monthly_credits_nonnegative CHECK (monthly_credits >= 0);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE users
      ADD CONSTRAINT users_purchased_credits_nonnegative CHECK (purchased_credits >= 0);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;

CREATE TABLE IF NOT EXISTS credit_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('monthly', 'purchased', 'conversion')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  subscription_id TEXT,
  period_key TEXT,
  tier TEXT,
  expires_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One monthly grant per (subscription, period): a redelivered
-- subscription_payment_success can never double-grant. Partial index
-- so rows with no subscription/period (purchased, conversion) never
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_grants_period_unique
  ON credit_grants (subscription_id, period_key)
  WHERE subscription_id IS NOT NULL AND period_key IS NOT NULL;

-- The Oracle conversion runs once per user, ever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_grants_conversion_unique
  ON credit_grants (user_id)
  WHERE kind = 'conversion';

CREATE INDEX IF NOT EXISTS idx_credit_grants_user_created
  ON credit_grants (user_id, granted_at DESC);
` },
  { version: "009", name: "subscriptions", sql: `-- 009_subscriptions.sql — Phase 2 batch 3: subscriptions + top-ups.
--
-- The subscriptions table is the local record of a Lemon Squeezy
-- subscription: one row per provider subscription (a customer can
-- have several over time — after an expiry a new checkout creates a
-- new provider subscription, so the provider id is the unique key,
-- not the user). The webhook upserts it on every subscription
-- event; the monthly grant is driven by it (grantMonthlyCredits,
-- idempotent per subscription + period) and the annual drip cron
-- reads it. Billing rules, decided in Batch B (recorded in the
-- batch report + docs/CREDIT-CUTOVER-RUNBOOK.md):
--   * Proration: Lemon Squeezy default — a tier change takes effect
--     at the next renewal; no immediate invoice. The new tier's
--     monthly grant starts the next period.
--   * Failed payment: no new grant while past_due; existing monthly
--     credits are kept until the subscription expires.
--   * Cancel: via the Lemon Squeezy customer portal (handles PayPal
--     + card). A cancelled subscription keeps access until ends_at;
--     on expiry the remaining monthly balance is zeroed (audit row
--     kind 'expiry'); purchased credits are never touched.
--   * Annual: charged up front, granted one month at a time by the
--     monthly drip cron (period key YYYY-MM). Undripped months are
--     never granted — cancel/refund forfeits them.
--
-- All statements are idempotent.

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  lemonsqueezy_subscription_id TEXT NOT NULL UNIQUE,
  lemonsqueezy_customer_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('spark', 'star', 'moon')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  status TEXT NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  renews_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_created
  ON subscriptions (user_id, created_at DESC);

-- The monthly-balance zeroing on expiry writes an audit row to
-- credit_grants (kind 'expiry', amount = the monthly balance
-- removed). Widen the 008 kind CHECK to allow it. Postgres has no
-- ALTER CONSTRAINT; drop + re-add, guarded so a re-run is a no-op.
DO $$
BEGIN
  BEGIN
    ALTER TABLE credit_grants DROP CONSTRAINT IF EXISTS credit_grants_kind_check;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE credit_grants
      ADD CONSTRAINT credit_grants_kind_check
      CHECK (kind IN ('monthly', 'purchased', 'conversion', 'expiry'));
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;
` },
  { version: "010", name: "refund_kind_and_flag", sql: `-- 010_refund_kind_and_flag.sql — Notes implementation (Batch A items 2/10, Batch B item 2).
--
-- Three changes, all additive and idempotent:
--   1. \`subscriptions.refunded_at\` — set when a FULL refund revokes a
--      subscription's whole cycle. The drip cron excludes refunded
--      rows (listActiveAnnualSubscriptions), so a refunded annual
--      plan stops dripping months 1-11 instead of keeping them
--      (Batch B miss-check item 2). A partial refund does NOT set
--      it: the subscription continues and the drip continues.
--      The webhook upsert never writes this column, so a later
--      subscription event cannot clear it; a renewal after a full
--      refund is a new subscription row (new provider id).
--   2. Widen the \`credit_grants\` kind CHECK to allow 'refund'.
--      Refund revokes are now audited as kind 'refund' instead of
--      overloading 'expiry' (which means "zeroed on expiry"),
--      so audits can tell a refund revoke from an expiry zeroing
--      (Batch B miss-check item 10). Postgres has no ALTER
--      CONSTRAINT; drop + re-add, guarded so a re-run is a no-op
--      (same DO-block pattern as migrations 008/009).
--   3. Scope \`idx_credit_grants_period_unique\` to kind 'monthly'.
--      The index exists to make monthly grants idempotent per
--      (subscription, period), but its predicate covered ALL kinds,
--      so a 'refund' audit row sharing the monthly row's
--      (subscription_id, period_key) collided with it and the
--      refund insert failed. Only 'monthly' rows are constrained
--      now; 'refund'/'expiry' audit rows can share the keys.
--      The ON CONFLICT clause in grantMonthlyCredits is updated
--      to match this predicate (Postgres requires the predicate
--      to match the index it infers).
--
-- All statements are idempotent.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

DO $$
BEGIN
  BEGIN
    ALTER TABLE credit_grants DROP CONSTRAINT IF EXISTS credit_grants_kind_check;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE credit_grants
      ADD CONSTRAINT credit_grants_kind_check
      CHECK (kind IN ('monthly', 'purchased', 'conversion', 'expiry', 'refund'));
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;

-- Scope the period-unique index to monthly grants only (see the
-- header comment). DROP + CREATE is idempotent; the IF NOT EXISTS
-- on the CREATE keeps a re-run a no-op.
DROP INDEX IF EXISTS idx_credit_grants_period_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_grants_period_unique
  ON credit_grants (subscription_id, period_key)
  WHERE subscription_id IS NOT NULL AND period_key IS NOT NULL AND kind = 'monthly';
` },
];

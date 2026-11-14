-- 008_credit_ledgers.sql — Phase 2 batch 2: two-ledger credit system.
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
-- replace. Any code that still writes `SET credits = ...` fails
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

-- 009_subscriptions.sql — Phase 2 batch 3: subscriptions + top-ups.
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

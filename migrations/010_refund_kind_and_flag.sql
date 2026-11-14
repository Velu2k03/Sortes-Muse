-- 010_refund_kind_and_flag.sql — Notes implementation (Batch A items 2/10, Batch B item 2).
--
-- Three changes, all additive and idempotent:
--   1. `subscriptions.refunded_at` — set when a FULL refund revokes a
--      subscription's whole cycle. The drip cron excludes refunded
--      rows (listActiveAnnualSubscriptions), so a refunded annual
--      plan stops dripping months 1-11 instead of keeping them
--      (Batch B miss-check item 2). A partial refund does NOT set
--      it: the subscription continues and the drip continues.
--      The webhook upsert never writes this column, so a later
--      subscription event cannot clear it; a renewal after a full
--      refund is a new subscription row (new provider id).
--   2. Widen the `credit_grants` kind CHECK to allow 'refund'.
--      Refund revokes are now audited as kind 'refund' instead of
--      overloading 'expiry' (which means "zeroed on expiry"),
--      so audits can tell a refund revoke from an expiry zeroing
--      (Batch B miss-check item 10). Postgres has no ALTER
--      CONSTRAINT; drop + re-add, guarded so a re-run is a no-op
--      (same DO-block pattern as migrations 008/009).
--   3. Scope `idx_credit_grants_period_unique` to kind 'monthly'.
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

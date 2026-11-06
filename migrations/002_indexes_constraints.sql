-- 002_indexes_constraints.sql — Phase 6 (readiness review N11).
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

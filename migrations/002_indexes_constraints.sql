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

-- Phase 6 (G2 finding): readings/reports written by the old
-- ${JSON.stringify(x)}::jsonb pattern were stored as JSON strings,
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

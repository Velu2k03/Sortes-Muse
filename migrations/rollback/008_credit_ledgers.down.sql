-- 008_credit_ledgers.down.sql — ROLLBACK for migrations/008_credit_ledgers.sql.
--
-- Restores the pre-008 single plain `credits` column, folding both
-- ledgers back into it. Run ONLY after the 008 code has been rolled
-- back first (old code cannot run against the 008 schema, and new
-- code cannot run against this one), and pg_dump BEFORE running.
--
-- After running, also delete the 008 row from schema_migrations if
-- 008 is meant to apply again later:
--   DELETE FROM schema_migrations WHERE version = '008';
-- (Check the actual version value recorded by scripts/migrate.mjs.)
--
-- Order matters: drop the generated column first, re-add it as a
-- plain column holding the summed balance, then drop the ledgers.
-- The column swap runs ONLY while the ledger columns still exist
-- (Batch N3, A3 — drill find): an unguarded re-run dropped the
-- plain `credits` column (with the restored balances in it),
-- re-added it as 0, and then failed on the missing ledger columns,
-- zeroing every balance. With the guard a re-run is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users'
               AND column_name = 'monthly_credits') THEN
    ALTER TABLE users DROP COLUMN credits;
    ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
    UPDATE users SET credits = monthly_credits + purchased_credits;
  END IF;
END
$$;

ALTER TABLE users DROP COLUMN IF EXISTS monthly_credits;
ALTER TABLE users DROP COLUMN IF EXISTS purchased_credits;
-- Archive the audit/idempotency rows BEFORE dropping the table
-- (Batch N3, A3): the down file used to lose them. The archive keeps
-- them for the post-rollback audit. Guarded on both tables so a
-- re-run is a no-op: if the archive already exists nothing is
-- re-copied, and if credit_grants is already gone nothing is read.
DO $$
BEGIN
  IF to_regclass('public.credit_grants') IS NOT NULL
     AND to_regclass('public.credit_grants_archive') IS NULL THEN
    EXECUTE 'CREATE TABLE credit_grants_archive AS SELECT * FROM credit_grants';
  END IF;
END
$$;
DROP TABLE IF EXISTS credit_grants;

-- Restore the 002 non-negative CHECK (008 dropped it with the old
-- column). Same DO-block pattern as 002/008 so a re-run is a no-op.
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

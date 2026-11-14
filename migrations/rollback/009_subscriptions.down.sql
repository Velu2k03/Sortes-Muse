-- 009_subscriptions.down.sql — ROLLBACK for migrations/009_subscriptions.sql.
--
-- Drops the subscriptions table and restores the pre-009
-- credit_grants kind CHECK (without 'expiry'). Run ONLY after the
-- 009 code has been rolled back first (old code cannot run against
-- the 009 schema, and new code cannot run against this one), and
-- pg_dump BEFORE running.
--
-- After running, also delete the 009 row from schema_migrations if
-- 009 is meant to apply again later:
--   DELETE FROM schema_migrations WHERE version = '009';
-- (Check the actual version value recorded by scripts/migrate.mjs.)
--
-- IMPORTANT: delete any credit_grants rows with kind = 'expiry'
-- BEFORE restoring the old CHECK, or the ADD CONSTRAINT fails
-- (those rows violate the pre-009 CHECK). Expiry rows are the audit
-- trail of monthly balances zeroed on subscription expiry; archive
-- them first if the audit trail must be kept:
--   CREATE TABLE IF NOT EXISTS credit_grants_expiry_archive (LIKE credit_grants INCLUDING ALL);
--   INSERT INTO credit_grants_expiry_archive
--     SELECT * FROM credit_grants WHERE kind = 'expiry';
--   DELETE FROM credit_grants WHERE kind = 'expiry';
-- (Use LIKE + INSERT, not CREATE TABLE ... AS: on a second rollback
-- cycle the AS form leaves an existing archive unchanged while the
-- DELETE still removes the new rows. The form above appends, and
-- re-running it is a no-op once the rows are gone. CodeRabbit review,
-- PR #93. The archive step is left to the operator: it is only
-- needed when expiry rows exist, and the operator decides whether
-- to keep them.)
--
-- Run with: psql -v ON_ERROR_STOP=1 --single-transaction -f <this file>
-- (CodeRabbit review, PR #93: without ON_ERROR_STOP a failed step
-- would still run the statements below it.)
--
-- Order matters: drop the subscriptions table first, then restore
-- the old CHECK. All statements are idempotent.

DROP TABLE IF EXISTS subscriptions;

-- Restore the 008 kind CHECK (without 'expiry'). Postgres has no
-- ALTER CONSTRAINT; drop + re-add, guarded so a re-run is a no-op.
-- The outer guard also covers a database where credit_grants does
-- not exist at all (e.g. the down file run against a pre-008 DB):
-- without it the DROP CONSTRAINT raises undefined_table, which the
-- inner undefined_object handler does not catch.
DO $$
BEGIN
  IF to_regclass('public.credit_grants') IS NOT NULL THEN
    BEGIN
      ALTER TABLE credit_grants DROP CONSTRAINT IF EXISTS credit_grants_kind_check;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    BEGIN
      ALTER TABLE credit_grants
        ADD CONSTRAINT credit_grants_kind_check
        CHECK (kind IN ('monthly', 'purchased', 'conversion'));
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;

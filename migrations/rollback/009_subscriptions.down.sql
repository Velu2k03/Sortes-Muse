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
-- Run with: psql -v ON_ERROR_STOP=1 -f <this file>
-- (CodeRabbit review, PR #93: without ON_ERROR_STOP a failed step
-- would still run the statements below it. Claude review, PR #93:
-- the file manages its own transaction — \set ON_ERROR_STOP on plus
-- BEGIN / COMMIT — so a failure part-way rolls everything back.
-- Do NOT add --single-transaction on top of the file's own BEGIN.)
--
-- Order matters: archive + drop the subscriptions table first,
-- archive + delete any 'expiry' grant rows, then restore the old
-- CHECK. Roll back in reverse apply order: 009 before 008.
-- All statements are idempotent.

\set ON_ERROR_STOP on
BEGIN;

-- Archive the subscriptions rows BEFORE dropping the table
-- (Claude review, PR #93): the table holds Lemon Squeezy
-- subscription ids, tiers, and current_period_start (the drip cycle
-- anchor). Re-applying 009 after a rollback would otherwise leave
-- paying subscribers with no local record. Same append-by-id
-- pattern as the 008 credit_grants archive, so a second rollback
-- cycle appends new rows instead of losing them.
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    IF to_regclass('public.subscriptions_archive') IS NULL THEN
      EXECUTE 'CREATE TABLE subscriptions_archive AS SELECT * FROM subscriptions';
    ELSE
      EXECUTE 'INSERT INTO subscriptions_archive SELECT s.* FROM subscriptions s WHERE NOT EXISTS (SELECT 1 FROM subscriptions_archive a WHERE a.id = s.id)';
    END IF;
  END IF;
END
$$;
-- Archive tables hold user ids: keep them out of the anon /
-- authenticated roles (Claude review, PR #93). RLS with zero
-- policies blocks every non-owner role.
ALTER TABLE IF EXISTS subscriptions_archive ENABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS subscriptions;

-- Archive + delete any credit_grants rows with kind = 'expiry'
-- BEFORE restoring the old CHECK, or the ADD CONSTRAINT fails
-- (those rows violate the pre-009 CHECK). Expiry rows are the audit
-- trail of monthly balances zeroed on subscription expiry.
-- Done in-file (Claude review, PR #93): leaving it to the operator
-- meant a forgotten step aborted the whole transaction with a
-- check_violation. The archive keeps the trail, so nothing is lost.
-- CTAS on the first cycle, append-by-id after that; re-running is a
-- no-op once the rows are gone. CTAS copies no indexes, so a second
-- cycle cannot collide on the archive's unique indexes.
DO $$
BEGIN
  IF to_regclass('public.credit_grants') IS NOT NULL THEN
    IF to_regclass('public.credit_grants_expiry_archive') IS NULL THEN
      EXECUTE 'CREATE TABLE credit_grants_expiry_archive AS SELECT * FROM credit_grants WHERE kind = ''expiry''';
    ELSE
      EXECUTE 'INSERT INTO credit_grants_expiry_archive SELECT g.* FROM credit_grants g WHERE g.kind = ''expiry'' AND NOT EXISTS (SELECT 1 FROM credit_grants_expiry_archive a WHERE a.id = g.id)';
    END IF;
    EXECUTE 'DELETE FROM credit_grants WHERE kind = ''expiry''';
  END IF;
END
$$;
ALTER TABLE IF EXISTS credit_grants_expiry_archive ENABLE ROW LEVEL SECURITY;

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

COMMIT;
-- End of 009 rollback.

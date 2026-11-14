-- 011_rls-credit-grants-subscriptions.down.sql — rollback for
-- migration 011. Disables Row Level Security on credit_grants and
-- subscriptions. Instant, no data loss. Only run as part of a
-- rollback of 011 (see docs/PRODUCTION-CHANGE-PLAN.md §11).
-- Re-running is a no-op (DISABLE is idempotent).

ALTER TABLE public.credit_grants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions DISABLE ROW LEVEL SECURITY;

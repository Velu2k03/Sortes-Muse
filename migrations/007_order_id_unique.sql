-- 007_order_id_unique.sql (AF-004)
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

-- 003_drop_checkout_nonces.sql — Phase 6B (readiness review N11).
-- The checkout claim endpoint and its nonce machinery were deleted
-- in Phase 6 (B-F), and the baseline migration 001 deliberately does
-- not create the table. Any database that ran the pre-Phase-6
-- ensureSchema() (local dev / staging) still holds the orphan table;
-- production never had it (verified live 2026-11-06: 6 of 8 tables,
-- checkout_nonces absent). Dropping it keeps the schema exactly what
-- the code expects. Idempotent (IF EXISTS) and safe: nothing in the
-- code references the table any more (verified by repo-wide grep).
-- RLS note: the approval-required RLS file is numbered 004 so it
-- promotes cleanly after this one.

DROP TABLE IF EXISTS checkout_nonces;

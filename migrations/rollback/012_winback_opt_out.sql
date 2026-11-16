-- Rollback for 012_winback_opt_out.sql.
-- Drops the opt-out flag. Everyone goes back to receiving the win-back
-- email until they opt out again (the preference is not preserved).
ALTER TABLE users DROP COLUMN IF EXISTS winback_opted_out;

/**
 * restore-verify.mjs — builds the row-count verify query for restore.mjs.
 *
 * The verify query must never name a table that does not exist in the
 * restored dump: Postgres resolves table names at PARSE time, so a
 * `to_regclass(...)` guard in a WHERE clause does NOT save a statement
 * that mentions the table anywhere else (Batch N3, A4 — the old
 * verify failed with "relation credit_grants does not exist" on
 * every pre-008 dump, aborting the restore AFTER the data was in).
 * The caller probes `to_regclass('public.<table>')` FIRST (one cheap
 * scalar query per optional table) and only then builds a query that
 * mentions the tables that exist.
 *
 * Optional tables (absent in older dumps):
 * - credit_grants: added by migration 008.
 * - subscriptions: added by migration 009 (Batch N3, B6).
 */

export function buildVerifySql({ hasCreditGrants, hasSubscriptions }) {
  const parts = [
    "SELECT 'users', count(*) FROM users",
    "SELECT 'auth_codes', count(*) FROM auth_codes",
  ];
  if (hasCreditGrants) {
    parts.push("SELECT 'credit_grants', count(*) FROM credit_grants");
  }
  if (hasSubscriptions) {
    parts.push("SELECT 'subscriptions', count(*) FROM subscriptions");
  }
  parts.push(
    "SELECT 'transactions', count(*) FROM transactions",
    "SELECT 'readings', count(*) FROM readings",
    "SELECT 'reports', count(*) FROM reports",
    "SELECT 'free_readings', count(*) FROM free_readings",
    "SELECT 'free_interpretations', count(*) FROM free_interpretations",
    "SELECT 'schema_migrations', count(*) FROM schema_migrations",
  );
  return parts.join(" UNION ALL\n") + "\nORDER BY 1;";
}

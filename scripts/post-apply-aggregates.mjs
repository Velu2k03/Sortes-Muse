#!/usr/bin/env node
/**
 * post-apply-aggregates.mjs — Notes N2 (A1): post-apply check for
 * the migrate workflow. After `npm run db:migrate` applies pending
 * migrations, prints PII-free aggregates so the run log shows the
 * schema landed as expected and the pre-apply sums can be compared
 * against the backup:
 *   - SUM(purchased_credits), SUM(monthly_credits), COUNT(*) of users
 *   - whether users.credits is generated (attgenerated = 's')
 *   - the two credit CHECK constraints present
 *   - credit_grants present (and its row count)
 *
 * PII-free by construction: counts and sums only, no ids, emails,
 * or per-user rows. Read-only: SELECTs only.
 *
 * Failure rule: fail loudly (exit 1) ONLY if the database
 * connection itself fails — without a connection nothing was
 * checked. An individual aggregate query that errors prints its
 * error and continues (the aggregates are a check, not the
 * migration itself, and must not fail the workflow).
 */
import postgres from "postgres";
import { sslForScriptUrl } from "./db-ssl.mjs";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
if (!connectionString) {
  console.error("post-apply-aggregates: DATABASE_URL (or POSTGRES_URL) is not set.");
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: sslForScriptUrl(connectionString),
  prepare: false,
  max: 1,
  connect_timeout: 10,
});

/** Run one aggregate; on error print it and return null (continue). */
async function aggregate(name, query) {
  try {
    const rows = await sql.unsafe(query);
    return rows[0] ?? null;
  } catch (err) {
    console.error(
      `post-apply-aggregates: ${name} FAILED (continuing): ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

let connectionOk = false;
try {
  await sql`SELECT 1`;
  connectionOk = true;
} catch (err) {
  console.error(
    `post-apply-aggregates: FAILED — could not connect to the database: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
}

if (connectionOk) {
  const sums = await aggregate(
    "user credit sums",
    "SELECT COALESCE(SUM(purchased_credits), 0)::bigint AS purchased_sum, COALESCE(SUM(monthly_credits), 0)::bigint AS monthly_sum, COUNT(*)::bigint AS user_count FROM users"
  );
  const generated = await aggregate(
    "users.credits generated check",
    "SELECT attgenerated = 's' AS is_generated FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'credits'"
  );
  const checks = await aggregate(
    "credit CHECK constraints",
    "SELECT COUNT(*)::bigint AS present FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname IN ('users_monthly_credits_nonnegative', 'users_purchased_credits_nonnegative')"
  );
  const grants = await aggregate(
    "credit_grants presence",
    "SELECT to_regclass('public.credit_grants') IS NOT NULL AS present, (SELECT COUNT(*)::bigint FROM credit_grants) AS row_count"
  );
  console.log(
    JSON.stringify({
      source: "sortes-migrate",
      event: "post-apply-aggregates",
      purchased_sum: sums ? Number(sums.purchased_sum) : null,
      monthly_sum: sums ? Number(sums.monthly_sum) : null,
      user_count: sums ? Number(sums.user_count) : null,
      credits_generated: generated ? Boolean(generated.is_generated) : null,
      credit_checks_present: checks ? Number(checks.present) : null,
      credit_grants_present: grants ? Boolean(grants.present) : null,
      credit_grants_rows: grants ? Number(grants.row_count) : null,
    })
  );
  await sql.end();
}

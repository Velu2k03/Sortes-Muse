#!/usr/bin/env node
/**
 * Oracle-holder census (docs/CREDIT-CUTOVER-RUNBOOK.md, precondition 2).
 * READ-ONLY: every query runs inside a READ ONLY transaction, so the
 * database itself rejects any write.
 *
 * Usage:
 *   POSTGRES_URL=postgres://... node scripts/census-oracles.mjs
 *
 * Output (stdout, JSON):
 *   {
 *     "database": "host:port/db",
 *     "takenAt": ISO timestamp,
 *     "holders": number of users with purchased_credits > 0,
 *     "totalOracles": sum of purchased_credits over holders,
 *     "totalCreditsAfterConversion": totalOracles x 300,
 *     "totalMonthlyCredits": sum of monthly_credits over ALL users
 *                            (must be 0 before the cutover),
 *     "usersWithMonthlyCredits": count of users with monthly_credits > 0,
 *     "alreadyConverted": holders that already have a 'conversion' grant
 *                         (must be 0 before the cutover),
 *     "warnings": [string, ...],
 *     "users": [{ id, email, purchased_credits, monthly_credits }, ...]
 *   }
 * plus a one-line human summary on stderr.
 *
 * Exit 0: census taken, no warnings.
 * Exit 1: census taken, but a pre-cutover invariant is broken
 *         (monthly credits present, or a holder already converted).
 * Exit 2: usage / environment / safety refusal, or the query failed.
 *
 * Safety: refuses a production-looking database URL (same test as
 * scripts/reconcile.mjs) unless SORTES_CENSUS_PRODUCTION=1. Requires
 * POSTGRES_URL or DATABASE_URL; refuses both set to different values.
 * Prints user emails: treat the output as personal data (do not
 * commit it or paste it into public places).
 */
import postgres from "postgres";
import { sslForScriptUrl } from "./db-ssl.mjs";

// Kept in step with ORACLE_TO_CREDITS in src/lib/subscription-tiers.ts
// (pinned by src/lib/__tests__/convert-oracles-runner.test.ts).
const ORACLE_TO_CREDITS = 300;

if (process.argv.length > 2) {
  console.error("census-oracles: takes no arguments.\nUsage: POSTGRES_URL=postgres://... node scripts/census-oracles.mjs");
  process.exit(2);
}

const pgUrl = process.env.POSTGRES_URL;
const dbAlias = process.env.DATABASE_URL;
if (pgUrl && dbAlias && pgUrl !== dbAlias) {
  console.error("census-oracles: POSTGRES_URL and DATABASE_URL are both set to different databases; set exactly one.");
  process.exit(2);
}
const dbUrl = pgUrl || dbAlias;
if (!dbUrl) {
  console.error("census-oracles: set POSTGRES_URL (or DATABASE_URL) to the database to count.");
  process.exit(2);
}
const looksProduction =
  process.env.NODE_ENV === "production" ||
  /\.supabase\.co/i.test(dbUrl) ||
  /pooler\.supabase\.com/i.test(dbUrl);
if (looksProduction && process.env.SORTES_CENSUS_PRODUCTION !== "1") {
  console.error("census-oracles: refusing a production-looking database without SORTES_CENSUS_PRODUCTION=1.");
  process.exit(2);
}

let database = "(unparseable url)";
try {
  const u = new URL(dbUrl);
  database = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
} catch {
  // keep the placeholder
}

const sql = postgres(dbUrl, { ssl: sslForScriptUrl(dbUrl), prepare: false, max: 1, onnotice: () => {} });

let result;
try {
  result = await sql.begin("read only", async (tx) => {
    const [{ grants }] = await tx`SELECT to_regclass('public.credit_grants') IS NOT NULL AS grants`;
    if (!grants) throw new Error("credit_grants table is missing: migration 008 is not applied to this database.");
    const users = await tx`
      SELECT id, email, purchased_credits, monthly_credits
      FROM users
      WHERE purchased_credits > 0
      ORDER BY created_at, id`;
    const [monthly] = await tx`
      SELECT COALESCE(SUM(monthly_credits), 0)::bigint AS total,
             COUNT(*) FILTER (WHERE monthly_credits > 0)::int AS users
      FROM users`;
    const [converted] = await tx`
      SELECT COUNT(DISTINCT g.user_id)::int AS n
      FROM credit_grants g JOIN users u ON u.id = g.user_id
      WHERE g.kind = 'conversion' AND u.purchased_credits > 0`;
    return { users, monthly, converted };
  });
} catch (err) {
  console.error(`census-oracles: query failed: ${err instanceof Error ? err.message : String(err)}`);
  await sql.end();
  process.exit(2);
}
await sql.end();

const users = result.users.map((u) => ({
  id: u.id,
  email: u.email,
  purchased_credits: u.purchased_credits,
  monthly_credits: u.monthly_credits,
}));
const totalOracles = users.reduce((s, u) => s + u.purchased_credits, 0);
const totalMonthlyCredits = Number(result.monthly.total);
const warnings = [];
if (totalMonthlyCredits !== 0) {
  warnings.push(
    `monthly_credits total is ${totalMonthlyCredits} across ${result.monthly.users} user(s); expected 0 before the cutover (no subscriptions should exist yet).`
  );
}
if (result.converted.n > 0) {
  warnings.push(
    `${result.converted.n} holder(s) already have a 'conversion' grant: their purchased_credits are credits, not Oracles, and must not be counted as Oracles.`
  );
}

const census = {
  database,
  takenAt: new Date().toISOString(),
  holders: users.length,
  totalOracles,
  totalCreditsAfterConversion: totalOracles * ORACLE_TO_CREDITS,
  totalMonthlyCredits,
  usersWithMonthlyCredits: result.monthly.users,
  alreadyConverted: result.converted.n,
  warnings,
  users,
};
process.stdout.write(`${JSON.stringify(census, null, 2)}\n`);
console.error(
  `CENSUS on ${database}: ${census.holders} holder(s), ${census.totalOracles} Oracles (= ${census.totalCreditsAfterConversion} credits at 1:${ORACLE_TO_CREDITS}), ` +
    `monthly total ${census.totalMonthlyCredits}.`
);
for (const w of warnings) console.error(`  WARNING: ${w}`);
process.exit(warnings.length > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * check-migrations.mjs — Notes N2 (B1a): prebuild migration guard.
 *
 * Compares the migration files in migrations/*.sql against the
 * versions recorded in the target database's schema_migrations
 * ledger and exits non-zero listing any missing version. Wired as
 * the `prebuild` script in package.json, so a Vercel build fails
 * BEFORE deploying code that needs a migration the database does
 * not have yet — a failed build leaves the old deployment live,
 * instead of deploying code that 500s on every DB call (the 009
 * incident: the merge auto-deployed code needing 009 against a DB
 * that did not have it).
 *
 * The check runs ONLY when SORTES_CHECK_MIGRATIONS=1. Otherwise it
 * prints "skipping migration check" and exits 0, so local dev and
 * Preview builds are unaffected. Vercel Production should set
 * SORTES_CHECK_MIGRATIONS=1 (a dashboard step — see
 * docs/PRODUCTION-CHANGE-PLAN.md §13).
 *
 * The expected versions come from re-reading migrations/*.sql
 * (the same directory scripts/sync-migrations.mjs generates
 * src/lib/migrations.generated.ts from, so the two cannot drift
 * without the migrations-sync test failing). The script is plain
 * .mjs and cannot import the TypeScript generated list.
 *
 * Read-only: one SELECT from schema_migrations. It never applies
 * anything. Connection via DATABASE_URL (fall back to POSTGRES_URL),
 * the same variables the app uses.
 */
import { readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { sslForScriptUrl } from "./db-ssl.mjs";

/**
 * Pure comparison, exported for tests: which expected versions are
 * not in the applied set? Order follows `expected`.
 * @param {string[]} expected
 * @param {Iterable<string>} applied
 * @returns {string[]}
 */
export function findMissingMigrations(expected, applied) {
  const done = new Set(applied);
  return expected.filter((v) => !done.has(v));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.env.SORTES_CHECK_MIGRATIONS !== "1") {
    console.log("check-migrations: skipping migration check (SORTES_CHECK_MIGRATIONS is not 1).");
    process.exit(0);
  }
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (!connectionString) {
    console.error("check-migrations: DATABASE_URL (or POSTGRES_URL) is not set; cannot check migrations.");
    process.exit(1);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const expected = readdirSync(path.join(root, "migrations"))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => f.split("_")[0]);
  const sql = postgres(connectionString, {
    ssl: sslForScriptUrl(connectionString),
    prepare: false,
    max: 1,
    connect_timeout: 10,
  });
  try {
    const applied = await sql`SELECT version FROM schema_migrations`;
    const missing = findMissingMigrations(expected, applied.map((r) => r.version));
    if (missing.length > 0) {
      console.error(
        `check-migrations: FAILED — ${missing.length} migration(s) not applied to the target database: ${missing.join(", ")}. ` +
          "Apply them first (see docs/PRODUCTION-CHANGE-PLAN.md §4/§8: back up, apply, then merge). " +
          "The build is stopped so the old deployment stays live."
      );
      process.exit(1);
    }
    console.log(`check-migrations: OK — all ${expected.length} migration(s) applied (${expected.join(", ")}).`);
  } catch (err) {
    console.error(
      "check-migrations: FAILED — could not read schema_migrations " +
        `(the ledger table may not exist yet, meaning no migration has ever applied): ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  } finally {
    await sql.end();
  }
}

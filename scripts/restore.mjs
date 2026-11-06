#!/usr/bin/env node
/**
 * restore.mjs — Phase 6B restore + verify for dumps made by
 * scripts/backup.mjs (pg_dump custom format).
 *
 * Restores a dump into a target database and then verifies it by
 * counting rows per table. Use it for the weekly restore test and
 * for staging restores (see docs/BACKUP-RECOVERY.md). Restoring
 * into production is destructive and needs Velu's explicit
 * approval for that specific incident.
 *
 * Usage:
 *   node scripts/restore.mjs --dump <file.dump> --target <postgres-url> [--create]
 *   SORTES_RESTORE_DATABASE_URL=postgres://... node scripts/restore.mjs --dump <file.dump>
 *
 * --create creates the target database first (via the `postgres`
 * maintenance database on the same host). Without it, the target
 * database must already exist.
 *
 * Safety: same guards as backup.mjs — refuses NODE_ENV=production
 * without SORTES_RESTORE_PRODUCTION=1, and refuses a remote
 * Supabase URL without SORTES_RESTORE_ALLOW_REMOTE=1. The target
 * is fully replaced: pg_restore drops and recreates the dumped
 * objects in it, so never point it at a database holding data
 * you want to keep.
 */
import { spawnSync } from "child_process";

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dump = arg("dump");
const target = arg("target") || process.env.SORTES_RESTORE_DATABASE_URL || "";
const create = process.argv.includes("--create");
if (!dump || !target) {
  console.error("restore: usage: node scripts/restore.mjs --dump <file.dump> --target <postgres-url> [--create]");
  process.exit(2);
}
if (process.env.NODE_ENV === "production" && process.env.SORTES_RESTORE_PRODUCTION !== "1") {
  console.error("restore: refusing to run with NODE_ENV=production without SORTES_RESTORE_PRODUCTION=1.");
  process.exit(2);
}
const isRemote = /\.supabase\.co/i.test(target) || /pooler\.supabase\.com/i.test(target);
if (isRemote && process.env.SORTES_RESTORE_ALLOW_REMOTE !== "1") {
  console.error("restore: refusing a remote Supabase URL without SORTES_RESTORE_ALLOW_REMOTE=1.");
  process.exit(2);
}

function run(cmd, args, input) {
  const res = spawnSync(cmd, args, { stdio: "inherit", input });
  if (res.status !== 0) {
    console.error(`restore: ${cmd} failed (status ${res.status})`);
    process.exit(1);
  }
}

if (create) {
  const url = new URL(target);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  url.pathname = "/postgres";
  const maintUrl = url.toString();
  console.log(`restore: creating database ${dbName} (if missing)`);
  const res = spawnSync("psql", [maintUrl, "-t", "-A", "-c", `SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}'`], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("restore: could not check the target database");
    process.exit(1);
  }
  if (res.stdout.trim() !== "1") {
    run("psql", [maintUrl, "-c", `CREATE DATABASE "${dbName.replace(/"/g, '""')}"`]);
  } else {
    console.log("restore: target database already exists");
  }
}

console.log(`restore: pg_restore ${dump} -> target database`);
run("pg_restore", ["--no-owner", "--no-acl", "--dbname", target, dump]);

const verifySql = `
SELECT 'users', count(*) FROM users UNION ALL
SELECT 'auth_codes', count(*) FROM auth_codes UNION ALL
SELECT 'transactions', count(*) FROM transactions UNION ALL
SELECT 'readings', count(*) FROM readings UNION ALL
SELECT 'reports', count(*) FROM reports UNION ALL
SELECT 'free_readings', count(*) FROM free_readings UNION ALL
SELECT 'free_interpretations', count(*) FROM free_interpretations UNION ALL
SELECT 'schema_migrations', count(*) FROM schema_migrations
ORDER BY 1;`;
console.log("restore: row counts in the restored database:");
run("psql", [target, "-c", verifySql.trim()]);
console.log("restore: OK — verify the counts above against the source before using this database.");

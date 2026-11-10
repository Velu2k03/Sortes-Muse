#!/usr/bin/env node
/**
 * restore.mjs - Restore + verify for dumps made by scripts/backup.mjs
 * (pg_dump custom format, plaintext or age-encrypted).
 *
 * Restores a dump into a target database and then verifies it by
 * counting rows per table. Use it for the weekly restore test and
 * for staging restores (see docs/BACKUP-RECOVERY.md). Restoring
 * into production is destructive and needs Velu's explicit
 * approval for that specific incident.
 *
 * Usage:
 *   node scripts/restore.mjs --dump <file.dump> --target <postgres-url> [--create]
 *   node scripts/restore.mjs --dump <file.dump.age> --target <postgres-url> [--age-key-file <path>] [--create]
 *   SORTES_RESTORE_DATABASE_URL=postgres://... SORTES_RESTORE_AGE_KEY_FILE=~/.config/sortes/age-key.txt node scripts/restore.mjs --dump <file.dump.age>
 *
 * --create creates the target database first (via the `postgres`
 * maintenance database on the same host). Without it, the target
 * database must already exist.
 *
 * Safety: same guards as backup.mjs - refuses NODE_ENV=production
 * without SORTES_RESTORE_PRODUCTION=1, and refuses a remote
 * Supabase URL without SORTES_RESTORE_ALLOW_REMOTE=1. The target
 * is fully replaced: pg_restore drops and recreates the dumped
 * objects in it, so never point it at a database holding data
 * you want to keep.
 */
import { spawnSync } from "child_process";
import { accessSync, constants, existsSync, rmSync } from "fs";
import { homedir } from "os";
import path from "path";
import { pgSslModeForUrl } from "./db-ssl.mjs";

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dump = arg("dump");
const target = arg("target") || process.env.SORTES_RESTORE_DATABASE_URL || "";
const create = process.argv.includes("--create");
const keyFileArg = arg("age-key-file");
const keyFile = keyFileArg || process.env.SORTES_RESTORE_AGE_KEY_FILE || "";

if (!dump || !target) {
  console.error("restore: usage: node scripts/restore.mjs --dump <file[.dump|.dump.age]> --target <postgres-url> [--age-key-file <path>] [--create]");
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

const isEncrypted = dump.endsWith(".age");
let resolvedKeyFile = "";
if (isEncrypted) {
  if (!keyFile) {
    console.error("restore: encrypted .age dump requires a private key file via --age-key-file or SORTES_RESTORE_AGE_KEY_FILE.");
    process.exit(2);
  }
  resolvedKeyFile = path.resolve(keyFile.replace(/^~/, homedir()));
  try {
    accessSync(resolvedKeyFile, constants.R_OK);
  } catch {
    console.error(`restore: private key file is missing or unreadable: ${keyFile}`);
    process.exit(2);
  }
}

// Env for a libpq tool: fail closed on SSL for non-local hosts (libpq
// defaults to sslmode=prefer). A sslmode in the URL still wins.
function sslEnv(dbUrl) {
  const mode = pgSslModeForUrl(dbUrl);
  return { ...process.env, ...(mode ? { PGSSLMODE: mode } : {}) };
}

function run(cmd, args, dbUrl) {
  const res = spawnSync(cmd, args, { stdio: "inherit", env: sslEnv(dbUrl) });
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
  const res = spawnSync("psql", [maintUrl, "-t", "-A", "-c", `SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}'`], { encoding: "utf8", env: sslEnv(maintUrl) });
  if (res.status !== 0) {
    console.error("restore: could not check the target database");
    process.exit(1);
  }
  if (res.stdout.trim() !== "1") {
    run("psql", [maintUrl, "-c", `CREATE DATABASE "${dbName.replace(/"/g, '""')}"`], maintUrl);
  } else {
    console.log("restore: target database already exists");
  }
}

let restoreSource = dump;
let tempPlaintext = "";

if (isEncrypted) {
  const dumpDir = path.dirname(path.resolve(dump));
  const baseName = path.basename(dump, ".age");
  tempPlaintext = path.join(dumpDir, `.restore-tmp-${baseName}-${Date.now()}.dump`);

  console.log(`restore: decrypting ${dump} with age...`);
  const decRes = spawnSync("age", ["--decrypt", "-i", resolvedKeyFile, "-o", tempPlaintext, dump], { stdio: "inherit" });
  if (decRes.status !== 0) {
    console.error(`restore: age decryption failed (status ${decRes.status})`);
    if (existsSync(tempPlaintext)) {
      rmSync(tempPlaintext, { force: true });
    }
    process.exit(1);
  }
  restoreSource = tempPlaintext;
}

try {
  console.log(`restore: pg_restore ${restoreSource} -> target database`);
  // NOTE: do not use run() here: it calls process.exit() on failure,
  // which would skip the finally cleanup of the decrypted temp file.
  // Hang diagnosis (2026-11-07): same statement_timeout exemption
  // as backup.mjs — a restore's COPY/INSERT batches can legitimately
  // exceed a database-level 10 s statement_timeout.
  const restoreRes = spawnSync("pg_restore", ["--no-owner", "--no-acl", "--dbname", target, restoreSource], {
    stdio: "inherit",
    env: {
      ...sslEnv(target),
      PGOPTIONS: [process.env.PGOPTIONS, "-c statement_timeout=0"]
        .filter(Boolean)
        .join(" "),
    },
  });
  if (restoreRes.status !== 0) {
    console.error(`restore: pg_restore failed (status ${restoreRes.status})`);
    process.exitCode = 1;
  }
} finally {
  if (isEncrypted && existsSync(tempPlaintext)) {
    rmSync(tempPlaintext, { force: true });
  }
}
if (process.exitCode) process.exit(process.exitCode);

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
run("psql", [target, "-c", verifySql.trim()], target);
console.log("restore: OK - verify the counts above against the source before using this database.");

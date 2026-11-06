#!/usr/bin/env node
/**
 * backup.mjs — Phase 6B logical backup wrapper around pg_dump.
 *
 * Takes a consistent snapshot of one database (custom format,
 * compressed, restorable with pg_restore) and keeps the newest N
 * dumps (default 14 daily). This is the scheduled-backup procedure
 * for production, because the Supabase FREE plan has no scheduled
 * backups and no PITR (verified live 2026-11-06) — see
 * docs/BACKUP-RECOVERY.md.
 *
 * Usage:
 *   SORTES_BACKUP_DATABASE_URL=postgres://... \
 *   [SORTES_BACKUP_DIR=~/workspace/sortes-backups] [SORTES_BACKUP_KEEP=14] \
 *   node scripts/backup.mjs
 *
 * Safety: refuses to run when NODE_ENV=production unless
 * SORTES_BACKUP_PRODUCTION=1 is set, and refuses any URL pointing
 * at a remote Supabase host unless SORTES_BACKUP_ALLOW_REMOTE=1 is
 * set. pg_dump itself is read-only against the source database.
 * Never pass a password on the command line: pg_dump reads it from
 * PGPASSWORD in the environment (the operator sets it from the
 * Secure Vault for a production run).
 */
import { spawnSync } from "child_process";
import { mkdirSync, readdirSync, rmSync, appendFileSync } from "fs";
import { homedir } from "os";
import path from "path";

const dbUrl = process.env.SORTES_BACKUP_DATABASE_URL || "";
if (!dbUrl) {
  console.error("backup: set SORTES_BACKUP_DATABASE_URL to the database to dump.");
  process.exit(2);
}
if (process.env.NODE_ENV === "production" && process.env.SORTES_BACKUP_PRODUCTION !== "1") {
  console.error("backup: refusing to run with NODE_ENV=production without SORTES_BACKUP_PRODUCTION=1.");
  process.exit(2);
}
const isRemote = /\.supabase\.co/i.test(dbUrl) || /pooler\.supabase\.com/i.test(dbUrl);
if (isRemote && process.env.SORTES_BACKUP_ALLOW_REMOTE !== "1") {
  console.error("backup: refusing a remote Supabase URL without SORTES_BACKUP_ALLOW_REMOTE=1.");
  process.exit(2);
}

const dir = process.env.SORTES_BACKUP_DIR
  ? path.resolve(process.env.SORTES_BACKUP_DIR.replace(/^~/, homedir()))
  : path.join(homedir(), "workspace", "sortes-backups");
const keep = Number(process.env.SORTES_BACKUP_KEEP ?? 14);
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
// stamp is YYYYMMDD-HHMMSS in UTC.
const file = path.join(dir, `sortes-${stamp}.dump`);
const logFile = path.join(dir, "backup.log");
const log = (obj) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  console.log(line);
  appendFileSync(logFile, line + "\n");
};

const res = spawnSync(
  "pg_dump",
  [dbUrl, "--format=custom", "--no-owner", "--no-acl", "--file", file],
  { stdio: "inherit" }
);
if (res.status !== 0) {
  log({ event: "backup-failed", file, status: res.status });
  process.exit(1);
}

// Retention: keep the newest `keep` dumps, delete the rest.
const dumps = readdirSync(dir)
  .filter((f) => /^sortes-\d{8}-\d{6}\.dump$/.test(f))
  .sort();
const pruned = [];
while (dumps.length > keep) {
  const old = dumps.shift();
  rmSync(path.join(dir, old));
  pruned.push(old);
}
log({ event: "backup-ok", file, kept: dumps.length, pruned });

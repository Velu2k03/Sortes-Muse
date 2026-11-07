#!/usr/bin/env node
/**
 * backup.mjs - Logical backup wrapper around pg_dump with age encryption.
 *
 * Takes a consistent snapshot of one database (custom format,
 * compressed, restorable with pg_restore) and keeps the newest N
 * dumps (default 14 daily). Encrypts with age (X25519) when a recipient
 * is configured, then deletes the plaintext dump.
 *
 * Usage:
 *   SORTES_BACKUP_DATABASE_URL=postgres://... \
 *   [SORTES_BACKUP_AGE_RECIPIENT=age1...] \
 *   [SORTES_BACKUP_AGE_RECIPIENT_FILE=~/.config/sortes/age-recipient.txt] \
 *   [SORTES_BACKUP_DIR=~/workspace/sortes-backups] [SORTES_BACKUP_KEEP=14] \
 *   node scripts/backup.mjs [--no-encrypt]
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
import { createHash } from "crypto";
import { mkdirSync, readdirSync, rmSync, appendFileSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import path from "path";

const noEncrypt = process.argv.includes("--no-encrypt");
const ageRecipient = process.env.SORTES_BACKUP_AGE_RECIPIENT || "";
const ageRecipientFile = process.env.SORTES_BACKUP_AGE_RECIPIENT_FILE || "";

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
  // Hang diagnosis (2026-11-07): the database may carry a
  // database-level statement_timeout (ALTER DATABASE ... SET
  // statement_timeout = '10s', the server-side half of the fix for
  // the pooler discarding the client startup parameter). pg_dump's
  // table scans can legitimately exceed 10 s, so lift it for this
  // session. PGOPTIONS is the documented way to pass per-session
  // settings to pg_dump; an operator-set PGOPTIONS is preserved.
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PGOPTIONS: [process.env.PGOPTIONS, "-c statement_timeout=0"]
        .filter(Boolean)
        .join(" "),
    },
  }
);
if (res.status !== 0) {
  log({ event: "backup-failed", step: "pg_dump", file, status: res.status });
  process.exit(1);
}

// Compute sha256 checksum of plaintext dump before encryption
const checksum = createHash("sha256").update(readFileSync(file)).digest("hex");
log({ event: "backup-checksum", file, sha256: checksum });

let shouldEncrypt = false;
let ageArgs = [];

if (noEncrypt) {
  shouldEncrypt = false;
} else if (ageRecipient) {
  shouldEncrypt = true;
  ageArgs = ["-r", ageRecipient];
} else if (ageRecipientFile) {
  const resolvedRecipientFile = path.resolve(ageRecipientFile.replace(/^~/, homedir()));
  if (!existsSync(resolvedRecipientFile)) {
    log({ event: "backup-failed", step: "encrypt", file, error: "recipient file not found" });
    process.exit(1);
  }
  shouldEncrypt = true;
  ageArgs = ["-R", resolvedRecipientFile];
} else {
  log({
    event: "backup-warning",
    message: "no age recipient configured and --no-encrypt absent; keeping plaintext dump unencrypted"
  });
}

let finalFile = file;

if (shouldEncrypt) {
  const encryptedFile = `${file}.age`;
  const ageRes = spawnSync(
    "age",
    [...ageArgs, "-o", encryptedFile, file],
    { stdio: "inherit" }
  );
  if (ageRes.status !== 0) {
    log({ event: "backup-failed", step: "encrypt", file, status: ageRes.status });
    process.exit(1);
  }

  rmSync(file);
  log({ event: "backup-encrypted", file: encryptedFile, plaintextRemoved: true });
  finalFile = encryptedFile;
}

// Retention: keep the newest `keep` dumps, delete the rest.
// Operates on .age files when encrypted, and on .dump files when unencrypted.
const pattern = shouldEncrypt
  ? /^sortes-\d{8}-\d{6}\.dump\.age$/
  : /^sortes-\d{8}-\d{6}\.dump$/;

const dumps = readdirSync(dir)
  .filter((f) => pattern.test(f))
  .sort();
const pruned = [];
while (dumps.length > keep) {
  const old = dumps.shift();
  rmSync(path.join(dir, old));
  pruned.push(old);
}

if (shouldEncrypt) {
  log({ event: "backup-ok", file: finalFile, encrypted: true, plaintextRemoved: true, kept: dumps.length, pruned });
} else {
  log({ event: "backup-ok", file: finalFile, encrypted: false, kept: dumps.length, pruned });
}

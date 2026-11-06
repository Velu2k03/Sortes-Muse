#!/usr/bin/env node
/**
 * backup-watchdog.mjs - Health watchdog for Sortes backups.
 *
 * Checks backup.log for a successful backup within the last 25 hours.
 * Exits 0 when a successful backup (event "backup-ok") exists in the
 * last 25 hours; exits 1 otherwise.
 *
 * Exact invocation for the daily mail digest cron (09:00 Asia/Manila):
 *   node /home/hatch/workspace/sortes/scripts/backup-watchdog.mjs
 * Or via npm:
 *   npm run db:backup:watchdog
 * Or for JSON-only output:
 *   node /home/hatch/workspace/sortes/scripts/backup-watchdog.mjs --json
 *
 * Usage:
 *   node scripts/backup-watchdog.mjs [--log <path>] [--json]
 *   SORTES_BACKUP_DIR=~/workspace/sortes-backups node scripts/backup-watchdog.mjs
 */
import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const jsonOnly = process.argv.includes("--json");
const logArg = arg("log");
const dirEnv = process.env.SORTES_BACKUP_DIR;

const logPath = logArg
  ? path.resolve(logArg.replace(/^~/, homedir()))
  : dirEnv
    ? path.join(path.resolve(dirEnv.replace(/^~/, homedir())), "backup.log")
    : path.join(homedir(), "workspace", "sortes-backups", "backup.log");

const now = Date.now();
const windowMs = 25 * 60 * 60 * 1000;
const cutoff25h = now - windowMs;

if (!existsSync(logPath)) {
  const missingResult = {
    healthy: false,
    error: `backup log not found at ${logPath}`,
    newestTimestamp: null,
    ageHours: null,
    dumpFile: null,
    dumpSize: "missing",
    failuresInLast25h: []
  };
  if (jsonOnly) {
    console.log(JSON.stringify(missingResult));
  } else {
    console.log("Sortes Backup Watchdog Summary:");
    console.log(`  Status: UNHEALTHY (log not found at ${logPath})`);
    console.log(JSON.stringify(missingResult));
  }
  process.exit(1);
}

const content = readFileSync(logPath, "utf8");
const lines = content.split("\n").filter((l) => l.trim().length > 0);

const events = [];
for (const line of lines) {
  try {
    events.push(JSON.parse(line));
  } catch {
    // ignore non-JSON lines
  }
}

// Find all backup-ok events
const okEvents = events
  .filter((e) => e.event === "backup-ok" && e.ts)
  .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

const newestOk = okEvents.length > 0 ? okEvents[okEvents.length - 1] : null;

// Find failures in the last 25 hours
const failuresInLast25h = events.filter((e) => {
  if (e.event !== "backup-failed" && e.event !== "backup-offsite-failed") {
    return false;
  }
  if (!e.ts) return false;
  const eventTime = new Date(e.ts).getTime();
  return eventTime >= cutoff25h;
});

let healthy = false;
let newestTimestamp = null;
let ageHours = null;
let dumpFile = null;
let dumpSize = "missing";

if (newestOk) {
  newestTimestamp = newestOk.ts;
  const newestTime = new Date(newestOk.ts).getTime();
  ageHours = Math.round(((now - newestTime) / (60 * 60 * 1000)) * 10) / 10;
  dumpFile = newestOk.file || null;

  if (dumpFile && existsSync(dumpFile)) {
    try {
      dumpSize = statSync(dumpFile).size;
    } catch {
      dumpSize = "missing";
    }
  } else {
    dumpSize = "missing";
  }

  if (newestTime >= cutoff25h) {
    healthy = true;
  }
}

const summary = {
  healthy,
  newestTimestamp,
  ageHours,
  dumpFile,
  dumpSize,
  failuresInLast25h
};

if (jsonOnly) {
  console.log(JSON.stringify(summary));
} else {
  console.log("Sortes Backup Watchdog Summary:");
  console.log(`  Status: ${healthy ? "HEALTHY" : "UNHEALTHY"}`);
  console.log(`  Newest Successful Backup: ${newestTimestamp ? `${newestTimestamp} (${ageHours}h ago)` : "none"}`);
  console.log(`  Dump File: ${dumpFile || "none"}`);
  console.log(`  Dump Size: ${typeof dumpSize === "number" ? `${dumpSize} bytes` : dumpSize}`);
  console.log(`  Failures in last 25h: ${failuresInLast25h.length}`);
  if (failuresInLast25h.length > 0) {
    for (const f of failuresInLast25h) {
      console.log(`    - [${f.ts}] ${f.event}: ${f.file || "unknown"} (status: ${f.status ?? "n/a"})`);
    }
  }
  console.log(JSON.stringify(summary));
}

process.exit(healthy ? 0 : 1);

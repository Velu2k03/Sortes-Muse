#!/usr/bin/env node
/**
 * Oracle -> credit conversion runner (docs/CREDIT-CUTOVER-RUNBOOK.md,
 * Procedure step 4). Converts every Oracle holder's balance to
 * purchased credits at 1 Oracle = 300 credits by calling the existing
 * convertOraclesToCredits() in src/lib/db/ledgers.ts once per holder.
 * This script holds NO conversion SQL of its own: the lock, the
 * idempotency check, the post-flag guard, the grant row, and the
 * history row all live in convertOraclesToCredits.
 *
 * Usage:
 *   POSTGRES_URL=postgres://... node scripts/convert-oracles.mjs \
 *     --flag-flipped-at 2026-11-21T03:00:00Z --dry-run
 *   POSTGRES_URL=postgres://... node scripts/convert-oracles.mjs \
 *     --flag-flipped-at 2026-11-21T03:00:00Z --live
 *
 * --flag-flipped-at  REQUIRED. The deploy time of the flag-ON commit,
 *                    ISO 8601 with an explicit zone (Z or +hh:mm).
 *                    Must not be in the future: a future flip time
 *                    would switch the post-flag purchase guard off.
 * --dry-run          List who WOULD convert (id, email, oracles,
 *                    credits). Read-only transaction; converts nothing.
 * --live             Convert. Exactly one of --dry-run / --live.
 *
 * Population: every user with purchased_credits > 0 (the census
 * population, scripts/census-oracles.mjs). A user whose conversion
 * grant already exists reports alreadyConverted, so a second --live
 * run converts nothing.
 *
 * Refused users (a monthly grant, or a purchase on/after the flip
 * time) are NEVER converted by this script, on any run: the guard in
 * convertOraclesToCredits refuses them every time. The `refused`
 * list in the output is the manual-handling list (runbook: verify
 * the post-flag purchase, convert only the pre-flag Oracle portion
 * by hand, record the decision).
 *
 * Output: JSON summary on stdout, short human summary on stderr.
 * Exit 0: every holder converted, was already converted, or was
 *         refused for a documented reason (dry-run: always 0).
 * Exit 1: at least one holder errored (recorded in errors[]; the run
 *         continues past it). Runbook: STOP, do not re-run blindly.
 * Exit 2: usage / environment / safety refusal (nothing converted).
 *
 * Safety:
 * - Refuses a production-looking database URL (same test as
 *   scripts/reconcile.mjs) unless SORTES_CONVERT_PRODUCTION=1.
 * - Against production it forces NODE_ENV=production before the db
 *   layer loads, so ensureSchema() only VERIFIES migrations (it
 *   throws on a pending one) and never applies them.
 * - --live refuses when CREDIT_COSTS_ENABLED is false in this
 *   checkout (runbook: conversion-before-flag leaks). Local test
 *   databases may override with SORTES_CONVERT_ALLOW_FLAG_OFF=1; the
 *   override is refused on a production-looking URL.
 * - Requires POSTGRES_URL or DATABASE_URL (never the local JSON
 *   store); refuses when both are set to different values.
 *
 * Why the import hook: the db layer is TypeScript with extensionless
 * relative imports ("./client"). The repo already runs TS from
 * scripts through Node 24 type stripping (scripts/charts-check.mjs);
 * Node's ESM resolver does not add ".ts" to extensionless specifiers,
 * so the hook below retries "<spec>.ts" for relative imports made
 * from .ts files. No new dependency (tsx/jiti) is needed.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { sslForScriptUrl } from "./db-ssl.mjs";

// stdout carries ONLY the JSON summary. The app pool in
// src/lib/db/client.ts logs Postgres NOTICEs (e.g. from migrations)
// through postgres.js's default console.log, so route console.log to
// stderr and write the summary with process.stdout.write.
console.log = (...args) => console.error(...args);
function emitSummary(summary) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const USAGE = `Usage: node scripts/convert-oracles.mjs --flag-flipped-at <ISO 8601 with zone> (--dry-run | --live)
  --flag-flipped-at  the flag-ON deploy time, e.g. 2026-11-21T03:00:00Z (required, not in the future)
  --dry-run          list who would convert; converts nothing
  --live             convert (production needs SORTES_CONVERT_PRODUCTION=1)`;

function usage(message) {
  console.error(`convert-oracles: ${message}\n${USAGE}`);
  process.exit(2);
}

// ---- args ---------------------------------------------------------------
const argv = process.argv.slice(2);
let flagFlippedAt;
let dryRun = false;
let live = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--dry-run") dryRun = true;
  else if (a === "--live") live = true;
  else if (a === "--flag-flipped-at") {
    flagFlippedAt = argv[i + 1];
    i += 1;
  } else if (a.startsWith("--flag-flipped-at=")) flagFlippedAt = a.slice("--flag-flipped-at=".length);
  else usage(`unknown argument ${JSON.stringify(a)}`);
}
if (dryRun === live) usage("pass exactly one of --dry-run or --live.");
if (!flagFlippedAt) usage("--flag-flipped-at is required.");
// An explicit zone is required: a zone-less time would be read in the
// operator's local zone and shift the purchase guard by hours.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const flipMs = Date.parse(flagFlippedAt);
if (!ISO_WITH_ZONE.test(flagFlippedAt) || Number.isNaN(flipMs)) {
  usage(`--flag-flipped-at must be an ISO 8601 timestamp with a zone (Z or +hh:mm); got ${JSON.stringify(flagFlippedAt)}.`);
}
if (flipMs > Date.now()) {
  usage(`--flag-flipped-at ${flagFlippedAt} is in the future; the flip must already have happened (a future time disables the post-flag purchase guard).`);
}
const flipIso = new Date(flipMs).toISOString();

// ---- environment + safety -----------------------------------------------
const pgUrl = process.env.POSTGRES_URL;
const dbAlias = process.env.DATABASE_URL;
if (pgUrl && dbAlias && pgUrl !== dbAlias) {
  usage("POSTGRES_URL and DATABASE_URL are both set to different databases; set exactly one.");
}
const dbUrl = pgUrl || dbAlias;
if (!dbUrl) usage("set POSTGRES_URL (or DATABASE_URL) to the database to convert.");

const looksProduction =
  process.env.NODE_ENV === "production" ||
  /\.supabase\.co/i.test(dbUrl) ||
  /pooler\.supabase\.com/i.test(dbUrl);
if (looksProduction && process.env.SORTES_CONVERT_PRODUCTION !== "1") {
  console.error("convert-oracles: refusing a production-looking database without SORTES_CONVERT_PRODUCTION=1.");
  process.exit(2);
}
if (looksProduction) {
  // ensureSchema() must only verify migrations against production.
  process.env.NODE_ENV = "production";
  delete process.env.SORTES_MIGRATE_PRODUCTION;
}

function describeDb(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable url)";
  }
}

// ---- TS import hook (see header) ------------------------------------------
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.endsWith(".ts") &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const tiers = await import("../src/lib/subscription-tiers.ts");
if (live && !tiers.CREDIT_COSTS_ENABLED) {
  if (process.env.SORTES_CONVERT_ALLOW_FLAG_OFF !== "1" || looksProduction) {
    console.error(
      "convert-oracles: CREDIT_COSTS_ENABLED is false in this checkout. Runbook order is flag-ON first, then convert " +
        "(converting first would leak). Run from the flag-ON commit. (Local test databases only: SORTES_CONVERT_ALLOW_FLAG_OFF=1.)"
    );
    process.exit(2);
  }
}

// ---- population -----------------------------------------------------------
const listSql = postgres(dbUrl, { ssl: sslForScriptUrl(dbUrl), prepare: false, max: 1, onnotice: () => {} });

let client;
let ledgers;
if (live) {
  // Live: load the db layer and let ensureSchema() run (applies pending
  // migrations on a test DB; verify-only on production, see above).
  client = await import("../src/lib/db/client.ts");
  ledgers = await import("../src/lib/db/ledgers.ts");
  await client.ensureSchema();
}

async function listHolders() {
  return listSql.begin("read only", async (tx) => {
    const [{ grants }] = await tx`SELECT to_regclass('public.credit_grants') IS NOT NULL AS grants`;
    if (!grants) throw new Error("credit_grants table is missing: migration 008 is not applied to this database.");
    return tx`
      SELECT u.id, u.email, u.purchased_credits, u.monthly_credits,
             EXISTS (SELECT 1 FROM credit_grants g WHERE g.user_id = u.id AND g.kind = 'conversion') AS converted
      FROM users u
      WHERE u.purchased_credits > 0
      ORDER BY u.created_at, u.id`;
  });
}

let holders;
try {
  holders = await listHolders();
} catch (err) {
  console.error(`convert-oracles: could not list holders: ${err instanceof Error ? err.message : String(err)}`);
  await listSql.end();
  if (client?.pg) await client.pg.end();
  process.exit(2);
}
await listSql.end();

const database = describeDb(dbUrl);

// ---- dry run ------------------------------------------------------------
if (dryRun) {
  const wouldConvert = [];
  const alreadyConvertedUsers = [];
  for (const h of holders) {
    if (h.converted) {
      alreadyConvertedUsers.push({ id: h.id, email: h.email, purchasedCredits: h.purchased_credits });
      continue;
    }
    wouldConvert.push({
      id: h.id,
      email: h.email,
      oracles: h.purchased_credits,
      credits: tiers.oracleToCredits(h.purchased_credits),
    });
  }
  const summary = {
    mode: "dry-run",
    database,
    flagFlippedAt: flipIso,
    holders: holders.length,
    wouldConvertCount: wouldConvert.length,
    alreadyConverted: alreadyConvertedUsers.length,
    totalOracles: wouldConvert.reduce((s, u) => s + u.oracles, 0),
    totalCredits: wouldConvert.reduce((s, u) => s + u.credits, 0),
    wouldConvert,
    alreadyConvertedUsers,
    note: "Refusals (monthly grant / post-flag purchase) are decided only by the live guard in convertOraclesToCredits; a would-convert user can still be refused at --live time.",
  };
  emitSummary(summary);
  console.error(
    `DRY RUN on ${database}: ${summary.wouldConvertCount} would convert (${summary.totalOracles} Oracles -> ${summary.totalCredits} credits), ` +
      `${summary.alreadyConverted} already converted. Nothing was changed.`
  );
  // exitCode instead of process.exit(): let stdout flush the JSON first.
  // listSql is already closed and dry-run never opens the app pool, so
  // the process ends once the module finishes (the live branch is skipped).
  process.exitCode = 0;
} else {
  // ---- live ---------------------------------------------------------------
  const converted = [];
  const alreadyConvertedUsers = [];
  const refused = [];
  const errors = [];
  for (const h of holders) {
    try {
      const r = await ledgers.convertOraclesToCredits(h.id, { flagFlippedAt: flipIso });
      if (r.converted) {
        converted.push({ id: h.id, email: h.email, oracles: r.oracles, credits: r.credits, balances: r.balances });
      } else if (r.alreadyConverted) {
        alreadyConvertedUsers.push({ id: h.id, email: h.email, credits: r.credits });
      } else if (r.refused) {
        refused.push({ id: h.id, email: h.email, oracles: h.purchased_credits, refuseReason: r.refuseReason ?? "refused (no reason given)" });
      } else {
        errors.push({ id: h.id, email: h.email, oracles: h.purchased_credits, error: "unexpected result: not converted, not already converted, not refused" });
      }
    } catch (err) {
      errors.push({ id: h.id, email: h.email, oracles: h.purchased_credits, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (client?.pg) await client.pg.end();

  const summary = {
    mode: "live",
    database,
    flagFlippedAt: flipIso,
    holders: holders.length,
    usersConverted: converted.length,
    alreadyConverted: alreadyConvertedUsers.length,
    refusedCount: refused.length,
    errorCount: errors.length,
    totalOracles: converted.reduce((s, u) => s + u.oracles, 0),
    totalCredits: converted.reduce((s, u) => s + u.credits, 0),
    converted,
    alreadyConvertedUsers,
    refused,
    errors,
  };
  emitSummary(summary);
  console.error(
    `LIVE on ${database}: ${summary.usersConverted} converted (${summary.totalOracles} Oracles -> ${summary.totalCredits} credits), ` +
      `${summary.alreadyConverted} already converted, ${summary.refusedCount} refused, ${summary.errorCount} errored.`
  );
  for (const r of refused) console.error(`  REFUSED ${r.id} ${r.email} oracles=${r.oracles}: ${r.refuseReason} (manual handling, see runbook)`);
  for (const e of errors) console.error(`  ERROR ${e.id} ${e.email} oracles=${e.oracles}: ${e.error}`);
  // exitCode instead of process.exit(): let stdout flush the JSON first.
  // Both pools (listSql, client.pg) are closed above.
  process.exitCode = errors.length > 0 ? 1 : 0;
}

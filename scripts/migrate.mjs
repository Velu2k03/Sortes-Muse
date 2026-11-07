#!/usr/bin/env node
/**
 * migrate.mjs — Phase 6 migration system, operator command.
 *
 * Applies pending migrations from migrations/*.sql to the database
 * named by POSTGRES_URL (or DATABASE_URL), in version order, each
 * inside one transaction, recording applied versions in
 * schema_migrations. Re-running is a no-op.
 *
 *   npm run db:migrate
 *
 * SAFETY: this writes schema to whatever database the env vars
 * point at. NEVER run it against production without Velu's explicit
 * approval, and never with production env vars loaded unless the
 * migration has been applied to staging first. The script refuses
 * to run when NODE_ENV=production unless SORTES_MIGRATE_PRODUCTION=1
 * is also set — that flag is the explicit approval, set by hand.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
if (!connectionString) {
  console.error("migrate: POSTGRES_URL (or DATABASE_URL) is not set. Nothing to do.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && process.env.SORTES_MIGRATE_PRODUCTION !== "1") {
  console.error(
    "migrate: refusing to run with NODE_ENV=production without SORTES_MIGRATE_PRODUCTION=1. " +
      "Applying migrations to production needs Velu's explicit approval."
  );
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();

const sql = postgres(connectionString, {
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? undefined
    : "require",
  prepare: false,
  max: 1,
  connect_timeout: 10,
  // Phase 6: CREATE TABLE/INDEX IF NOT EXISTS emits NOTICE objects
  // ("relation already exists, skipping") that postgres.js prints
  // raw — they look like errors and add no information, so drop
  // exactly those. Phase 6B: the old handler swallowed ALL notices,
  // including migration 002's RAISE WARNING when it skips an
  // unparseable row — that warning must stay visible, so anything
  // else is printed.
  onnotice: (notice) => {
    const msg = typeof notice === "string" ? notice : (notice?.message ?? "");
    if (/already exists, skipping/i.test(msg)) return;
    console.warn(`[migrate notice] ${msg}`);
  },
});

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  const applied = await sql`SELECT version FROM schema_migrations`;
  const done = new Set(applied.map((r) => r.version));
  let count = 0;
  for (const file of files) {
    const version = file.split("_")[0];
    const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "");
    if (done.has(version)) {
      console.log(`  ${version} ${name} — already applied`);
      continue;
    }
    const text = readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      // Race-safe ledger insert (2026-11-07): the test suite runs
      // the CLI and the in-app runner against the same migrations
      // test DB in parallel; a version recorded between this
      // runner's "not applied" check and its INSERT must be a
      // no-op, not a 23505 failure (the file SQL is idempotent).
      // Same guard on the in-app insert (src/lib/migrations.ts).
      await tx`INSERT INTO schema_migrations (version, name) VALUES (${version}, ${name}) ON CONFLICT (version) DO NOTHING`;
    });
    console.log(`  ${version} ${name} — applied`);
    count += 1;
  }
  console.log(`migrate: done, ${count} new migration(s) applied.`);
} catch (err) {
  console.error("migrate: FAILED — no partial migration was recorded (each file is transactional):", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}

import type postgres from "postgres";
import { MIGRATION_FILES } from "./migrations.generated";

/**
 * Phase 6: versioned migrations. Replaces the old ensureSchema()
 * CREATE TABLE IF NOT EXISTS approach (db.ts) with numbered SQL
 * files in migrations/ + a schema_migrations ledger.
 *
 * Rules:
 * - Each file applies inside ONE transaction: its SQL plus the
 *   ledger insert commit together or not at all. A crash mid-file
 *   leaves the database exactly as it was.
 * - Files apply in version order, only once. Re-running is a no-op.
 * - Every migration must itself be idempotent (IF NOT EXISTS, the
 *   DO-block pattern for constraints), so a half-applied file from
 *   the old ensureSchema era can never break a re-run.
 * - No ORM. The SQL files are the schema; this file is only the
 *   runner. The generated list (migrations.generated.ts) is synced
 *   from migrations/*.sql by scripts/sync-migrations.mjs.
 * - Production application still needs Velu's explicit approval:
 *   apply with `npm run db:migrate` (scripts/migrate.mjs) against
 *   the target database. The in-app runner (ensureSchema) applies
 *   pending files on first DB use in development, test, and Vercel
 *   Preview — but NEVER in production: there it only verifies that
 *   nothing is pending and throws naming the pending versions
 *   (Phase 6B — the runner used to auto-apply in production too,
 *   which bypassed the approval gate).
 */
export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";

export interface AppliedMigration {
  version: string;
  name: string;
}

async function readAppliedVersions(
  pg: postgres.Sql,
  createLedger: boolean
): Promise<Set<string>> {
  // Bug 3 (2026-11-07): check existence FIRST and CREATE only when
  // the table is missing. The old order (CREATE TABLE IF NOT
  // EXISTS, then check) emitted the 42P07 NOTICE ("relation
  // schema_migrations already exists, skipping") on EVERY cold
  // start, because ensureSchema runs this on first DB use per
  // instance. Now the NOTICE fires only in the rare race where two
  // instances both see the table missing; CREATE TABLE IF NOT
  // EXISTS stays as the fallback, so that race is still safe (the
  // second CREATE is a no-op, and both sides then read the ledger).
  // No client_min_messages hiding: notices stay visible.
  const exists = await pg`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${SCHEMA_MIGRATIONS_TABLE}`;
  if (exists.length === 0) {
    if (!createLedger) return new Set();
    await pg.unsafe(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }
  const applied = (await pg`
    SELECT version FROM ${pg(SCHEMA_MIGRATIONS_TABLE)}`) as Array<{
    version: string;
  }>;
  return new Set(applied.map((r) => r.version));
}

/** Apply every pending migration, in order. Returns what was applied. */
export async function runMigrations(
  pg: postgres.Sql,
  opts?: { allowApply?: boolean }
): Promise<AppliedMigration[]> {
  // Phase 6B production gate: the running app must never apply a
  // migration to production by itself. Vercel Preview/Development
  // still auto-apply (they point at staging, never production), and
  // an operator can opt in explicitly with SORTES_MIGRATE_PRODUCTION=1
  // (the same flag scripts/migrate.mjs uses).
  const allowApply =
    opts?.allowApply ??
    (process.env.SORTES_MIGRATE_PRODUCTION === "1" ||
      process.env.NODE_ENV !== "production" ||
      process.env.VERCEL_ENV === "preview" ||
      process.env.VERCEL_ENV === "development");
  const appliedVersions = await readAppliedVersions(pg, allowApply);
  if (!allowApply) {
    const pending = MIGRATION_FILES.filter((f) => !appliedVersions.has(f.version));
    if (pending.length > 0) {
      throw new Error(
        `Pending database migrations must be applied by an operator, not by the running app: ${pending
          .map((f) => `${f.version} ${f.name}`)
          .join(", ")}. Apply with \`npm run db:migrate\` (production needs SORTES_MIGRATE_PRODUCTION=1 and Velu's explicit approval).`
      );
    }
    return [];
  }
  const done: AppliedMigration[] = [];
  for (const file of MIGRATION_FILES) {
    if (appliedVersions.has(file.version)) continue;
    await pg.begin(async (tx) => {
      // Bug 3 (2026-11-07): the app connection carries a 10 s
      // statement_timeout, but a migration file must never be
      // killed mid-DDL — 002 runs CREATE INDEX and a row-by-row
      // repair loop that can legitimately exceed 10 s on a
      // production-size table, and a timeout inside this
      // transaction would roll back the file partway. SET LOCAL is
      // scoped to this transaction only, so the lift cannot leak
      // to app queries on the shared max:1 connection; the CLI
      // (scripts/migrate.mjs) already runs with no timeout, so
      // this keeps the in-app path consistent with it.
      // Pool-unwedging (2026-11-07): the same exemption covers
      // idle_in_transaction_session_timeout, which is set at the
      // database level on staging (and, at release, production)
      // as the server-side half of the hang fix — a long migration
      // that pauses between statements inside its transaction
      // must never be killed mid-DDL by the idle-in-transaction
      // limit either. SET LOCAL scopes both lifts to this file
      // transaction only.
      await tx.unsafe(`SET LOCAL statement_timeout = 0`);
      await tx.unsafe(`SET LOCAL idle_in_transaction_session_timeout = 0`);
      await tx.unsafe(file.sql);
      await tx`
        INSERT INTO ${tx(SCHEMA_MIGRATIONS_TABLE)} (version, name)
        VALUES (${file.version}, ${file.name})`;
    });
    done.push({ version: file.version, name: file.name });
  }
  return done;
}

/** Versions recorded as applied, in order. */
export async function listAppliedMigrations(
  pg: postgres.Sql
): Promise<AppliedMigration[]> {
  const rows = (await pg`
    SELECT version, name FROM ${pg(SCHEMA_MIGRATIONS_TABLE)}
    ORDER BY version ASC`) as AppliedMigration[];
  return rows;
}
